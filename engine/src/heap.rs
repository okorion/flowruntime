//! Generational arena, runtime objects, and explicit reference edges.
//!
//! A Run owns Task handles and each Task points back to its Run, intentionally
//! forming real execution cycles. Values and resumable continuations live in
//! this same arena. Rust owns slot storage; the tracing collector owns object
//! liveness. No raw pointers, reference counting, or unsafe code are involved.
use crate::*;

#[derive(Clone)]
pub(crate) struct Run {
    pub(crate) id: u64,
    pub(crate) workflow: Workflow,
    pub(crate) status: String,
    pub(crate) started: u64,
    pub(crate) completed: Option<u64>,
    pub(crate) initial: Handle,
    pub(crate) tasks: Vec<Handle>,
    pub(crate) result: Option<Handle>,
    pub(crate) error: Option<String>,
}
#[derive(Clone)]
pub(crate) struct Task {
    pub(crate) run: Handle,
    pub(crate) node_id: String,
    pub(crate) label: String,
    pub(crate) kind: String,
    pub(crate) status: String,
    pub(crate) started: u64,
    pub(crate) completed: Option<u64>,
    pub(crate) input: Handle,
    pub(crate) output: Option<Handle>,
    pub(crate) continuation: Option<Handle>,
    pub(crate) error: Option<String>,
}
#[derive(Clone)]
pub(crate) struct Continuation {
    pub(crate) run: Handle,
    pub(crate) source_task: Option<Handle>,
    pub(crate) value: Handle,
    pub(crate) node_id: String,
}
#[derive(Clone)]
pub(crate) enum Object {
    Run(Run),
    Task(Task),
    Value(Value),
    Continuation(Continuation),
}
impl Object {
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Self::Run(_) => "Run",
            Self::Task(_) => "Task",
            Self::Value(_) => "Value",
            Self::Continuation(_) => "Continuation",
        }
    }
    pub(crate) fn references(&self) -> Vec<Handle> {
        match self {
            Self::Run(run) => {
                let mut refs = vec![run.initial];
                refs.extend(&run.tasks);
                refs.extend(run.result);
                refs
            }
            Self::Task(task) => {
                let mut refs = vec![task.run, task.input];
                refs.extend(task.output);
                refs.extend(task.continuation);
                refs
            }
            Self::Value(_) => vec![],
            Self::Continuation(c) => {
                let mut refs = vec![c.run, c.value];
                refs.extend(c.source_task);
                refs
            }
        }
    }
    pub(crate) fn weight(&self) -> usize {
        // A conservative budget for object storage and JSON tree overhead.
        // It is not a measurement of process or WebAssembly linear memory.
        match self {
            Self::Run(r) => 4096 + encoded_len(&r.workflow) * 16,
            Self::Task(_) => 2048,
            Self::Value(v) => 256 + encoded_len(v) * 16,
            Self::Continuation(_) => 512,
        }
    }
}
pub(crate) struct Slot {
    pub(crate) generation: u32,
    pub(crate) object: Option<Object>,
    pub(crate) marked: bool,
    pub(crate) retired: bool,
    pub(crate) weight: usize,
}
pub(crate) struct Heap {
    pub(crate) slots: Vec<Slot>,
    pub(crate) free: Vec<u32>,
    pub(crate) live: usize,
    pub(crate) bytes: usize,
    pub(crate) allocations: u64,
    pub(crate) reused: u64,
}
impl Heap {
    pub(crate) fn new() -> Self {
        Self {
            slots: vec![],
            free: vec![],
            live: 0,
            bytes: 0,
            allocations: 0,
            reused: 0,
        }
    }
    pub(crate) fn get(&self, h: Handle) -> Option<&Object> {
        self.slots
            .get(h.index as usize)
            .filter(|s| s.generation == h.generation && !s.retired)?
            .object
            .as_ref()
    }
    pub(crate) fn get_mut(&mut self, h: Handle) -> Option<&mut Object> {
        self.slots
            .get_mut(h.index as usize)
            .filter(|s| s.generation == h.generation && !s.retired)?
            .object
            .as_mut()
    }
    pub(crate) fn alloc(&mut self, object: Object) -> Result<Handle, String> {
        let weight = object.weight();
        if self.bytes.saturating_add(weight) > MAX_HEAP_BYTES
            || (self.free.is_empty() && self.slots.len() >= MAX_SLOTS)
        {
            return Err("Heap safety limit reached. Enable automatic GC, collect garbage, unpin runs, or reset the runtime.".into());
        }
        let index = if let Some(index) = self.free.pop() {
            self.reused += 1;
            index
        } else {
            self.slots.push(Slot {
                generation: 1,
                object: None,
                marked: false,
                retired: false,
                weight: 0,
            });
            (self.slots.len() - 1) as u32
        };
        let slot = &mut self.slots[index as usize];
        slot.object = Some(object);
        slot.marked = false;
        slot.weight = weight;
        self.live += 1;
        self.bytes += weight;
        self.allocations += 1;
        Ok(Handle {
            index,
            generation: slot.generation,
        })
    }
    pub(crate) fn reachable(&self, roots: impl IntoIterator<Item = Handle>) -> BTreeSet<Handle> {
        let mut reachable = BTreeSet::new();
        let mut stack: Vec<Handle> = roots.into_iter().collect();
        while let Some(handle) = stack.pop() {
            if let Some(object) = self.get(handle) {
                if reachable.insert(handle) {
                    stack.extend(object.references());
                }
            }
        }
        reachable
    }
    pub(crate) fn release(&mut self, index: usize) {
        let slot = &mut self.slots[index];
        if slot.object.take().is_none() {
            return;
        }
        self.live -= 1;
        self.bytes -= slot.weight;
        slot.weight = 0;
        slot.marked = false;
        if let Some(generation) = slot.generation.checked_add(1) {
            slot.generation = generation;
            self.free.push(index as u32);
        } else {
            // Never wrap a generation: even a decades-old handle stays stale.
            slot.retired = true;
        }
    }
    pub(crate) fn stats(&self) -> Value {
        let mut by_type =
            BTreeMap::from([("Run", 0), ("Task", 0), ("Value", 0), ("Continuation", 0)]);
        for slot in &self.slots {
            if let Some(object) = &slot.object {
                *by_type.entry(object.kind()).or_default() += 1;
            }
        }
        json!({"live_objects":self.live,"capacity":self.slots.len(),"free_slots":self.free.len(),"retired_slots":self.slots.iter().filter(|s|s.retired).count(),"allocations":self.allocations,"reused_slots":self.reused,"by_type":by_type})
    }
}
