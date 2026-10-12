//! Iterative tracing collector and measured mark/sweep phases.
use crate::*;

#[derive(Clone, Serialize)]
pub struct GcCycle {
    pub(crate) cycle: u64,
    pub(crate) at_ms: u64,
    pub(crate) roots: usize,
    pub(crate) before: usize,
    pub(crate) marked: usize,
    pub(crate) swept: usize,
    pub(crate) reclaimed: usize,
    pub(crate) free_slots: usize,
    pub(crate) mark_ms: f64,
    pub(crate) sweep_ms: f64,
    pub(crate) pause_ms: f64,
}

#[cfg(not(target_arch = "wasm32"))]
struct Timer(std::time::Instant);
#[cfg(not(target_arch = "wasm32"))]
impl Timer {
    fn new() -> Self {
        Self(std::time::Instant::now())
    }
    fn ms(&self) -> f64 {
        self.0.elapsed().as_secs_f64() * 1000.0
    }
}
#[cfg(target_arch = "wasm32")]
struct Timer(f64);
#[cfg(target_arch = "wasm32")]
impl Timer {
    fn now() -> f64 {
        web_sys::window()
            .and_then(|window| window.performance())
            .map(|performance| performance.now())
            .unwrap_or(0.0)
    }
    fn new() -> Self {
        Self(Self::now())
    }
    fn ms(&self) -> f64 {
        (Self::now() - self.0).max(0.0)
    }
}

impl Engine {
    pub(crate) fn safe_point(&mut self) {
        // Call only after an event has committed all new graph edges. Temporary
        // local handles during execution must never race a collection.
        self.retained.retain(|_, (_, until)| *until > self.now);
        if self.auto_gc
            && (self
                .heap
                .allocations
                .saturating_sub(self.last_gc_allocations)
                >= 512
                || self.now.saturating_sub(self.last_gc_at) >= 1000
                || self.heap.bytes > MAX_HEAP_BYTES * 3 / 4)
        {
            self.collect();
        }
    }
    pub fn collect(&mut self) -> GcCycle {
        let pause = Timer::new();
        self.retained.retain(|_, (_, until)| *until > self.now);
        let roots = self.root_map();
        let before = self.heap.live;
        let mark_timer = Timer::new();
        for slot in &mut self.heap.slots {
            slot.marked = false;
        }
        let mut stack: Vec<Handle> = roots.keys().copied().collect();
        let mut marked = 0;
        while let Some(handle) = stack.pop() {
            if let Some(slot) = self.heap.slots.get_mut(handle.index as usize) {
                if slot.generation == handle.generation && !slot.retired && !slot.marked {
                    if let Some(object) = &slot.object {
                        slot.marked = true;
                        marked += 1;
                        stack.extend(object.references());
                    }
                }
            }
        }
        let mark_ms = mark_timer.ms();
        let sweep_timer = Timer::new();
        let swept = self.heap.slots.len();
        for index in 0..swept {
            if self.heap.slots[index].object.is_some() && !self.heap.slots[index].marked {
                self.heap.release(index);
            }
        }
        let heap = &self.heap;
        self.run_index
            .retain(|_, handle| matches!(heap.get(*handle), Some(Object::Run(_))));
        let sweep_ms = sweep_timer.ms();
        self.gc_cycles += 1;
        let cycle = GcCycle {
            cycle: self.gc_cycles,
            at_ms: self.now,
            roots: roots.len(),
            before,
            marked,
            swept,
            reclaimed: before - self.heap.live,
            free_slots: self.heap.free.len(),
            mark_ms,
            sweep_ms,
            pause_ms: pause.ms(),
        };
        self.total_reclaimed += cycle.reclaimed as u64;
        self.cumulative_gc_ms += cycle.pause_ms;
        self.last_gc_at = self.now;
        self.last_gc_allocations = self.heap.allocations;
        self.gc_history.push_back(cycle.clone());
        if self.gc_history.len() > 60 {
            self.gc_history.pop_front();
        }
        cycle
    }
}
