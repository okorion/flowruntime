//! Bounded diagnostic snapshots; inspecting objects never pins them.
use crate::*;

impl Engine {
    pub(crate) fn root_map(&self) -> BTreeMap<Handle, String> {
        let mut roots = BTreeMap::<Handle, String>::new();
        let mut add = |handle: Handle, reason: &str| {
            if self.heap.get(handle).is_some() {
                roots
                    .entry(handle)
                    .and_modify(|r| {
                        r.push_str(", ");
                        r.push_str(reason);
                    })
                    .or_insert_with(|| reason.into());
            }
        };
        for h in self.active.values() {
            add(*h, "active run");
        }
        for (h, until) in self.retained.values() {
            if *until > self.now {
                add(*h, "completed run retention");
            }
        }
        for h in self.pins.values() {
            add(*h, "user pin");
        }
        for event in &self.events {
            add(event.0.continuation, "scheduler continuation");
        }
        roots
    }
    pub(crate) fn roots_json(&self) -> Value {
        Value::Array(
            self.root_map()
                .into_iter()
                .map(|(handle, reason)| json!({"handle":handle,"reason":reason}))
                .collect(),
        )
    }
    pub(crate) fn find_run(&self, id: u64) -> Option<Handle> {
        self.run_index
            .get(&id)
            .copied()
            .filter(|h| matches!(self.heap.get(*h), Some(Object::Run(_))))
    }
    pub(crate) fn value(&self, handle: Option<Handle>) -> Value {
        match handle.and_then(|h| self.heap.get(h)) {
            Some(Object::Value(value)) => value.clone(),
            _ => Value::Null,
        }
    }
    pub(crate) fn summary(&self, handle: Handle) -> Option<Value> {
        let run = match self.heap.get(handle) {
            Some(Object::Run(run)) => run,
            _ => return None,
        };
        Some(
            json!({"id":run.id,"name":run.workflow.name,"status":run.status,"started_at":run.started,"completed_at":run.completed,"handle":handle,"pinned":self.pins.contains_key(&run.id),"retained":self.retained.get(&run.id).is_some_and(|(_,until)|*until>self.now),"collected":false,"task_count":run.tasks.len(),"result":self.value(run.result),"error":run.error}),
        )
    }
    pub(crate) fn run_detail(&self, id: u64) -> Result<Value, String> {
        let Some(handle) = self.find_run(id) else {
            let mut detail = self
                .history
                .iter()
                .find(|entry| entry["id"].as_u64() == Some(id))
                .cloned()
                .ok_or("Run history is unavailable or has expired")?;
            detail["collected"] = json!(true);
            detail["retained"] = json!(false);
            detail["pinned"] = json!(false);
            return Ok(detail);
        };
        let run = match self.heap.get(handle) {
            Some(Object::Run(run)) => run,
            _ => return Err("Stale Run handle".into()),
        };
        let mut detail = self.summary(handle).ok_or("Run unavailable")?;
        detail["workflow"] = serde_json::to_value(&run.workflow).map_err(|e| e.to_string())?;
        detail["tasks"] = Value::Array(run.tasks.iter().filter_map(|handle| match self.heap.get(*handle) { Some(Object::Task(task)) => Some(json!({"node_id":task.node_id,"label":task.label,"kind":task.kind,"status":task.status,"started_at":task.started,"completed_at":task.completed,"handle":handle,"input":self.value(Some(task.input)),"output":self.value(task.output),"error":task.error})), _ => None }).collect());
        Ok(detail)
    }
    pub fn state(&self) -> Value {
        let mut runs = BTreeMap::<u64, Value>::new();
        for old in &self.history {
            let id = old["id"].as_u64().unwrap_or(0);
            let mut summary = self
                .find_run(id)
                .and_then(|h| self.summary(h))
                .unwrap_or_else(|| {
                    let mut value = Value::Object(
                        old.as_object()
                            .unwrap()
                            .iter()
                            .filter(|(key, _)| {
                                key.as_str() != "workflow" && key.as_str() != "tasks"
                            })
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    );
                    value["collected"] = json!(true);
                    value["retained"] = json!(false);
                    value["pinned"] = json!(false);
                    value
                });
            summary["pinned"] = json!(self.pins.contains_key(&id));
            runs.insert(id, summary);
        }
        for (id, handle) in self.active.iter().chain(self.pins.iter()) {
            if let Some(summary) = self.summary(*handle) {
                runs.insert(*id, summary);
            }
        }
        json!({"now_ms":self.now,"paused":self.paused,"auto_gc":self.auto_gc,"pending_events":self.events.len(),"active_runs":self.active.len(),"retained_runs":self.retained.values().filter(|(_,until)|*until>self.now).count(),"pinned_runs":self.pins.len(),"total_runs":self.total_runs,"completed_runs":self.completed_runs,"failed_runs":self.failed_runs,"runs":runs.into_values().rev().collect::<Vec<_>>(),"heap":self.heap.stats(),"gc":{"cycles":self.gc_cycles,"total_reclaimed":self.total_reclaimed,"cumulative_ms":self.cumulative_gc_ms,"last":self.gc_history.back(),"history":self.gc_history},"roots":self.roots_json(),"limits":{"max_runs":MAX_RUNS,"max_nodes":MAX_NODES,"max_events":MAX_EVENTS,"max_payload_bytes":MAX_PAYLOAD,"max_virtual_ms":MAX_VIRTUAL,"max_steps":MAX_STEPS,"retention_ms":RETENTION,"history_limit":HISTORY}})
    }
    pub(crate) fn object_view(
        &self,
        handle: Handle,
        roots: &BTreeMap<Handle, String>,
        reachable: &BTreeSet<Handle>,
    ) -> Option<Value> {
        let object = self.heap.get(handle)?;
        let label = match object {
            Object::Run(r) => format!("Run #{} · {}", r.id, r.workflow.name),
            Object::Task(t) => format!("{} · {}", t.label, t.status),
            Object::Value(_) => "Captured payload".into(),
            Object::Continuation(c) => format!("Resume {}", c.node_id),
        };
        let mut view = json!({"handle":handle,"kind":object.kind(),"label":label,"references":object.references(),"root":roots.contains_key(&handle),"reachable":reachable.contains(&handle),"marked":self.heap.slots[handle.index as usize].marked});
        if let Object::Value(value) = object {
            view["payload"] = value.clone();
        }
        Some(view)
    }
    pub(crate) fn heap_snapshot(&self, limit: usize) -> Value {
        let roots = self.root_map();
        let reachable = self.heap.reachable(roots.keys().copied());
        let slots: Vec<Value> = self.heap.slots.iter().enumerate().take(limit).map(|(index, slot)| { let handle = Handle { index: index as u32, generation: slot.generation }; json!({"index":index,"generation":slot.generation,"state":if slot.retired {"retired"} else if slot.object.is_some() {"occupied"} else {"free"},"kind":slot.object.as_ref().map(Object::kind),"marked":slot.marked,"reachable":reachable.contains(&handle)}) }).collect();
        let objects: Vec<Value> = self
            .heap
            .slots
            .iter()
            .enumerate()
            .take(limit)
            .filter_map(|(index, slot)| {
                self.object_view(
                    Handle {
                        index: index as u32,
                        generation: slot.generation,
                    },
                    &roots,
                    &reachable,
                )
            })
            .collect();
        json!({"stats":self.heap.stats(),"slots":slots,"objects":objects,"truncated":self.heap.slots.len()>limit})
    }
    pub(crate) fn reference_graph(&self, run_id: Option<u64>, limit: usize) -> Value {
        let roots = self.root_map();
        let reachable = self.heap.reachable(roots.keys().copied());
        let candidates = if let Some(id) = run_id {
            self.find_run(id)
                .map(|h| self.heap.reachable([h]))
                .unwrap_or_default()
        } else {
            self.heap
                .slots
                .iter()
                .enumerate()
                .filter_map(|(index, slot)| {
                    slot.object.as_ref().map(|_| Handle {
                        index: index as u32,
                        generation: slot.generation,
                    })
                })
                .collect()
        };
        let objects: Vec<Value> = candidates
            .iter()
            .take(limit)
            .filter_map(|h| self.object_view(*h, &roots, &reachable))
            .collect();
        let root_views: Vec<Value> = roots
            .iter()
            .filter(|(handle, _)| candidates.iter().take(limit).any(|h| h == *handle))
            .map(|(handle, reason)| json!({"handle":handle,"reason":reason}))
            .collect();
        json!({"objects":objects,"roots":root_views,"truncated":candidates.len()>limit})
    }
}
