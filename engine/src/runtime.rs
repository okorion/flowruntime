//! Deterministic virtual-time scheduler and workflow execution.
use crate::*;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Event {
    pub(crate) due: u64,
    pub(crate) sequence: u64,
    pub(crate) continuation: Handle,
}
pub struct Engine {
    pub(crate) heap: Heap,
    pub(crate) workflow: Option<Workflow>,
    pub(crate) now: u64,
    pub(crate) paused: bool,
    pub(crate) auto_gc: bool,
    pub(crate) events: BinaryHeap<Reverse<Event>>,
    pub(crate) active: BTreeMap<u64, Handle>,
    /// Weak lookup only: entries do not participate in the GC root set.
    pub(crate) run_index: BTreeMap<u64, Handle>,
    pub(crate) retained: BTreeMap<u64, (Handle, u64)>,
    pub(crate) pins: BTreeMap<u64, Handle>,
    pub(crate) history: VecDeque<Value>,
    pub(crate) history_bytes: usize,
    pub(crate) next_id: u64,
    pub(crate) sequence: u64,
    pub(crate) total_runs: u64,
    pub(crate) completed_runs: u64,
    pub(crate) failed_runs: u64,
    pub(crate) gc_cycles: u64,
    pub(crate) total_reclaimed: u64,
    pub(crate) cumulative_gc_ms: f64,
    pub(crate) gc_history: VecDeque<GcCycle>,
    pub(crate) last_gc_allocations: u64,
    pub(crate) last_gc_at: u64,
}
impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}
impl Engine {
    pub fn new() -> Self {
        Self {
            heap: Heap::new(),
            workflow: None,
            now: 0,
            paused: false,
            auto_gc: true,
            events: BinaryHeap::new(),
            active: BTreeMap::new(),
            run_index: BTreeMap::new(),
            retained: BTreeMap::new(),
            pins: BTreeMap::new(),
            history: VecDeque::new(),
            history_bytes: 0,
            next_id: 0,
            sequence: 0,
            total_runs: 0,
            completed_runs: 0,
            failed_runs: 0,
            gc_cycles: 0,
            total_reclaimed: 0,
            cumulative_gc_ms: 0.0,
            gc_history: VecDeque::new(),
            last_gc_allocations: 0,
            last_gc_at: 0,
        }
    }
    pub fn dispatch_json(&mut self, request: &str) -> String {
        if request.len() > MAX_WORKFLOW * 2 {
            return json!({"ok":false,"error":"Command exceeds 256 KiB"}).to_string();
        }
        let result = serde_json::from_str::<Value>(request)
            .map_err(|error| format!("Invalid JSON: {error}"))
            .and_then(|request| self.dispatch(request));
        match result {
            Ok(data) => json!({"ok":true,"data":data}).to_string(),
            Err(error) => json!({"ok":false,"error":error}).to_string(),
        }
    }
    pub(crate) fn dispatch(&mut self, request: Value) -> Result<Value, String> {
        let op = request
            .get("op")
            .and_then(Value::as_str)
            .ok_or("Command requires op")?;
        match op {
            "validate" | "load" => {
                let workflow: Workflow = serde_json::from_value(
                    request.get("workflow").cloned().ok_or("Missing workflow")?,
                )
                .map_err(|e| format!("Invalid workflow: {e}"))?;
                let errors = validate(&workflow);
                let valid = errors.is_empty();
                if op == "load" {
                    if !valid {
                        return Err(errors.join("; "));
                    }
                    self.workflow = Some(workflow);
                }
                Ok(json!({"valid":valid,"errors":errors}))
            }
            "start" => {
                self.safe_point();
                self.start(request.get("input").cloned().ok_or("Missing input")?)
            }
            "tick" | "step" => {
                let delta = request
                    .get("delta_ms")
                    .and_then(Value::as_u64)
                    .filter(|d| *d <= 60_000)
                    .ok_or("delta_ms must be an integer from 0 to 60000")?;
                if op == "step" {
                    self.paused = true;
                    self.advance(delta)?;
                } else if !self.paused {
                    self.advance(delta)?;
                }
                Ok(json!({"now_ms":self.now,"paused":self.paused}))
            }
            "pause" => {
                self.paused = true;
                Ok(self.state())
            }
            "resume" => {
                self.paused = false;
                Ok(self.state())
            }
            "reset" => {
                self.reset();
                Ok(self.state())
            }
            "clear_diagnostics" => {
                self.history.clear();
                self.history_bytes = 0;
                self.total_runs = self.active.len() as u64;
                self.completed_runs = 0;
                self.failed_runs = 0;
                self.gc_history.clear();
                self.gc_cycles = 0;
                self.total_reclaimed = 0;
                self.cumulative_gc_ms = 0.0;
                self.heap.allocations = 0;
                self.heap.reused = 0;
                self.last_gc_allocations = 0;
                self.safe_point();
                Ok(self.state())
            }
            "cancel" => {
                let id = run_id(&request)?;
                let handle = *self.active.get(&id).ok_or("Run is not active")?;
                self.finish(handle, "cancelled", None, None);
                self.safe_point();
                Ok(self.state())
            }
            "pin" => {
                let id = run_id(&request)?;
                let pinned = request
                    .get("pinned")
                    .and_then(Value::as_bool)
                    .ok_or("pinned must be boolean")?;
                if pinned {
                    let handle = self
                        .find_run(id)
                        .ok_or("Run has been collected or is unknown")?;
                    if self.pins.len() >= 64 && !self.pins.contains_key(&id) {
                        return Err("At most 64 runs may be pinned".into());
                    }
                    self.pins.insert(id, handle);
                } else {
                    self.pins.remove(&id);
                }
                Ok(self.state())
            }
            "auto_gc" => {
                self.auto_gc = request
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .ok_or("enabled must be boolean")?;
                self.safe_point();
                Ok(self.state())
            }
            "collect" => serde_json::to_value(self.collect()).map_err(|e| e.to_string()),
            "state" => Ok(self.state()),
            "run" => self.run_detail(run_id(&request)?),
            "heap" => Ok(self.heap_snapshot(query_limit(&request, 256))),
            "references" => Ok(self.reference_graph(
                request
                    .get("run_id")
                    .map(|_| run_id(&request))
                    .transpose()?,
                query_limit(&request, 120),
            )),
            "inspect" => {
                let handle: Handle =
                    serde_json::from_value(request.get("handle").cloned().ok_or("Missing handle")?)
                        .map_err(|e| format!("Malformed handle: {e}"))?;
                let roots = self.root_map();
                let reachable = self.heap.reachable(roots.keys().copied());
                match self.object_view(handle, &roots, &reachable) {
                    Some(object) => Ok(json!({"valid":true,"object":object})),
                    None => Ok(
                        json!({"valid":false,"error":"Stale, free, retired, or out-of-range handle"}),
                    ),
                }
            }
            _ => Err(format!("Unknown command: {op}")),
        }
    }
    pub(crate) fn start(&mut self, input: Value) -> Result<Value, String> {
        check_payload(&input)?;
        if self.active.len() >= MAX_RUNS {
            return Err("At most 256 concurrent runs are allowed".into());
        }
        let workflow = self.workflow.clone().ok_or("Load a valid workflow first")?;
        let trigger = workflow
            .nodes
            .iter()
            .find(|n| n.kind == "trigger")
            .ok_or("Workflow has no Trigger")?
            .id
            .clone();
        let id = self
            .next_id
            .checked_add(1)
            .filter(|v| *v <= MAX_SAFE_ID)
            .ok_or("Run id limit reached")?;
        // Consume ids even if a later allocation fails; an orphaned partial
        // allocation must never share an identity with a subsequent run.
        self.next_id = id;
        let value = self.heap.alloc(Object::Value(input))?;
        let run = self.heap.alloc(Object::Run(Run {
            id,
            workflow,
            status: "running".into(),
            started: self.now,
            completed: None,
            initial: value,
            tasks: vec![],
            result: None,
            error: None,
        }))?;
        self.schedule(run, None, value, trigger, self.now)?;
        self.active.insert(id, run);
        self.run_index.insert(id, run);
        self.total_runs += 1;
        Ok(self.summary(run).ok_or("Run allocation failed")?)
    }
    pub(crate) fn schedule(
        &mut self,
        run: Handle,
        source_task: Option<Handle>,
        value: Handle,
        node_id: String,
        due: u64,
    ) -> Result<Handle, String> {
        if self.events.len() >= MAX_EVENTS {
            return Err("Pending event limit reached".into());
        }
        let sequence = self
            .sequence
            .checked_add(1)
            .filter(|v| *v <= MAX_SAFE_ID)
            .ok_or("Scheduler sequence limit reached")?;
        let handle = self.heap.alloc(Object::Continuation(Continuation {
            run,
            source_task,
            value,
            node_id,
        }))?;
        self.sequence = sequence;
        self.events.push(Reverse(Event {
            due,
            sequence,
            continuation: handle,
        }));
        Ok(handle)
    }
    pub(crate) fn advance(&mut self, delta: u64) -> Result<(), String> {
        let target = self
            .now
            .checked_add(delta)
            .filter(|t| *t <= MAX_VIRTUAL)
            .ok_or("Virtual time limit reached; reset runtime")?;
        let mut steps = 0;
        while self
            .events
            .peek()
            .is_some_and(|event| event.0.due <= target)
        {
            if steps >= MAX_STEPS {
                self.safe_point();
                return Err("Per-tick step budget reached; advance again".into());
            }
            steps += 1;
            let event = self.events.pop().ok_or("Scheduler unavailable")?.0;
            self.now = self.now.max(event.due);
            let continuation = match self.heap.get(event.continuation) {
                Some(Object::Continuation(c)) => c.clone(),
                _ => continue,
            };
            let run = continuation.run;
            if let Err(error) = self.execute(continuation) {
                self.finish(run, "failed", None, Some(error));
            }
            self.safe_point();
        }
        self.now = target;
        self.safe_point();
        Ok(())
    }
    pub(crate) fn execute(&mut self, continuation: Continuation) -> Result<(), String> {
        let (id, started, node, edges) = match self.heap.get(continuation.run) {
            Some(Object::Run(run)) => (
                run.id,
                run.started,
                run.workflow
                    .nodes
                    .iter()
                    .find(|n| n.id == continuation.node_id)
                    .cloned()
                    .ok_or("Continuation target is missing")?,
                run.workflow
                    .edges
                    .iter()
                    .filter(|e| e.source == continuation.node_id)
                    .cloned()
                    .collect::<Vec<_>>(),
            ),
            _ => return Err("Continuation has a stale Run handle".into()),
        };
        if !self.active.contains_key(&id) {
            return Ok(());
        }
        if self.now.saturating_sub(started) >= RUN_TIMEOUT {
            return Err("Run exceeded its 120000 ms virtual-time timeout".into());
        }
        if let Some(task) = continuation.source_task {
            if let Some(Object::Task(task)) = self.heap.get_mut(task) {
                task.continuation = None;
                task.status = "completed".into();
                task.completed = Some(self.now);
            }
        }
        let input = match self.heap.get(continuation.value) {
            Some(Object::Value(value)) => value.clone(),
            _ => return Err("Continuation captured a stale Value handle".into()),
        };
        let task = self.heap.alloc(Object::Task(Task {
            run: continuation.run,
            node_id: node.id.clone(),
            label: node.label.clone(),
            kind: node.kind.clone(),
            status: "running".into(),
            started: self.now,
            completed: None,
            input: continuation.value,
            output: None,
            continuation: None,
            error: None,
        }))?;
        if let Some(Object::Run(run)) = self.heap.get_mut(continuation.run) {
            run.tasks.push(task);
            run.status = "running".into();
        }
        let result = self.execute_node(&node, &input);
        let (output, branch) = match result {
            Ok(result) => result,
            Err(error) => {
                if let Some(Object::Task(task)) = self.heap.get_mut(task) {
                    task.status = "failed".into();
                    task.completed = Some(self.now);
                    task.error = Some(error.clone());
                }
                return Err(error);
            }
        };
        let output_handle = if node.kind == "transform" {
            self.heap.alloc(Object::Value(output))?
        } else {
            continuation.value
        };
        if let Some(Object::Task(task)) = self.heap.get_mut(task) {
            task.output = Some(output_handle);
        }
        if node.kind == "output" {
            if let Some(Object::Task(task)) = self.heap.get_mut(task) {
                task.status = "completed".into();
                task.completed = Some(self.now);
            }
            self.finish(continuation.run, "completed", Some(output_handle), None);
            return Ok(());
        }
        let next = edges
            .iter()
            .find(|edge| {
                if node.kind == "condition" {
                    edge.branch.as_deref() == Some(if branch { "true" } else { "false" })
                } else {
                    true
                }
            })
            .ok_or("Node has no matching outgoing edge")?
            .target
            .clone();
        let delay = if node.kind == "delay" {
            node.config["duration_ms"].as_u64().unwrap_or(0)
        } else {
            0
        };
        let due = self
            .now
            .checked_add(delay)
            .ok_or("Delay time overflow")?
            .min(started + RUN_TIMEOUT);
        let next_continuation =
            self.schedule(continuation.run, Some(task), output_handle, next, due)?;
        if let Some(Object::Task(task)) = self.heap.get_mut(task) {
            task.continuation = Some(next_continuation);
            if node.kind == "delay" {
                task.status = "waiting".into();
            } else {
                task.status = "completed".into();
                task.completed = Some(self.now);
            }
        }
        if let Some(Object::Run(run)) = self.heap.get_mut(continuation.run) {
            run.status = if node.kind == "delay" {
                "waiting"
            } else {
                "running"
            }
            .into();
        }
        Ok(())
    }
    pub(crate) fn execute_node(
        &self,
        node: &WorkflowNode,
        input: &Value,
    ) -> Result<(Value, bool), String> {
        match node.kind.as_str() {
            "transform" => {
                if node.config.get("fail").and_then(Value::as_bool) == Some(true) {
                    return Err(format!("Transform '{}' was configured to fail", node.label));
                }
                let mut output = input.clone();
                let field = node.config["field"]
                    .as_str()
                    .ok_or("Missing transform field")?;
                output
                    .as_object_mut()
                    .ok_or("Transform requires an object")?
                    .insert(field.into(), node.config["value"].clone());
                check_payload(&output)?;
                Ok((output, true))
            }
            "condition" => {
                let field = node.config["field"]
                    .as_str()
                    .ok_or("Missing condition field")?;
                let actual = input.get(field);
                let expected = &node.config["value"];
                let branch = match node.config["operator"].as_str().unwrap_or("") {
                    "exists" => actual.is_some(),
                    "eq" => actual == Some(expected),
                    "ne" => actual != Some(expected),
                    operator => {
                        let a = actual.and_then(Value::as_f64);
                        let b = expected.as_f64();
                        match (a, b) {
                            (Some(a), Some(b)) => match operator {
                                "gt" => a > b,
                                "gte" => a >= b,
                                "lt" => a < b,
                                "lte" => a <= b,
                                _ => false,
                            },
                            _ => false,
                        }
                    }
                };
                Ok((input.clone(), branch))
            }
            _ => Ok((input.clone(), true)),
        }
    }
    pub(crate) fn finish(
        &mut self,
        handle: Handle,
        status: &str,
        result: Option<Handle>,
        error: Option<String>,
    ) {
        let (id, tasks) = match self.heap.get_mut(handle) {
            Some(Object::Run(run)) => {
                if run.completed.is_some() {
                    return;
                }
                run.status = status.into();
                run.completed = Some(self.now);
                run.result = result;
                run.error = error.clone();
                (run.id, run.tasks.clone())
            }
            _ => return,
        };
        for task in tasks {
            if let Some(Object::Task(task)) = self.heap.get_mut(task) {
                task.continuation = None;
                if task.status == "running" || task.status == "waiting" {
                    task.status = status.into();
                    task.completed = Some(self.now);
                    task.error = error.clone();
                }
            }
        }
        self.active.remove(&id);
        let heap = &self.heap;
        self.events.retain(|event| !matches!(heap.get(event.0.continuation), Some(Object::Continuation(c)) if c.run == handle));
        self.retained
            .insert(id, (handle, self.now.saturating_add(RETENTION)));
        if status == "completed" {
            self.completed_runs += 1;
        } else if status == "failed" {
            self.failed_runs += 1;
        }
        // Diagnostic values contain copied JSON, never owning heap references.
        if let Ok(detail) = self.run_detail(id) {
            self.history_bytes += encoded_len(&detail);
            self.history.push_back(detail);
            while self.history.len() > HISTORY || self.history_bytes > MAX_HISTORY_BYTES {
                if let Some(old) = self.history.pop_front() {
                    self.history_bytes -= encoded_len(&old);
                }
            }
        }
    }
    pub(crate) fn reset(&mut self) {
        self.events.clear();
        self.active.clear();
        self.run_index.clear();
        self.retained.clear();
        self.pins.clear();
        self.history.clear();
        self.history_bytes = 0;
        for index in 0..self.heap.slots.len() {
            self.heap.release(index);
        }
        self.now = 0;
        self.paused = false;
        self.total_runs = 0;
        self.completed_runs = 0;
        self.failed_runs = 0;
        self.gc_cycles = 0;
        self.total_reclaimed = 0;
        self.cumulative_gc_ms = 0.0;
        self.gc_history.clear();
        self.heap.allocations = 0;
        self.heap.reused = 0;
        self.last_gc_allocations = self.heap.allocations;
        self.last_gc_at = 0;
    }
}

fn run_id(request: &Value) -> Result<u64, String> {
    request
        .get("run_id")
        .and_then(Value::as_u64)
        .filter(|id| *id > 0 && *id <= MAX_SAFE_ID)
        .ok_or_else(|| "run_id must be a positive safe integer".into())
}
pub(crate) fn query_limit(request: &Value, maximum: usize) -> usize {
    request
        .get("limit")
        .and_then(Value::as_u64)
        .map(|n| n.min(maximum as u64) as usize)
        .unwrap_or(maximum)
}
