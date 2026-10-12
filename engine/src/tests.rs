use super::*;

fn node(id: &str, kind: &str, config: Value) -> WorkflowNode {
    WorkflowNode {
        id: id.into(),
        label: id.into(),
        kind: kind.into(),
        config,
        position: Position { x: 0.0, y: 0.0 },
    }
}
fn edge(id: &str, source: &str, target: &str, branch: Option<&str>) -> WorkflowEdge {
    WorkflowEdge {
        id: id.into(),
        source: source.into(),
        target: target.into(),
        branch: branch.map(String::from),
    }
}
fn workflow(delay: u64) -> Workflow {
    Workflow {
        id: "test".into(),
        name: "Test".into(),
        nodes: vec![
            node("trigger", "trigger", json!({})),
            node(
                "transform",
                "transform",
                json!({"field":"answer","value":42}),
            ),
            node("delay", "delay", json!({"duration_ms":delay})),
            node("output", "output", json!({})),
        ],
        edges: vec![
            edge("a", "trigger", "transform", None),
            edge("b", "transform", "delay", None),
            edge("c", "delay", "output", None),
        ],
    }
}
fn command(engine: &mut Engine, request: Value) -> Value {
    let response: Value =
        serde_json::from_str(&engine.dispatch_json(&request.to_string())).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    response["data"].clone()
}
fn loaded(delay: u64) -> Engine {
    let mut engine = Engine::new();
    command(&mut engine, json!({"op":"load","workflow":workflow(delay)}));
    engine
}
fn start(engine: &mut Engine, input: Value) -> Value {
    command(engine, json!({"op":"start","input":input}))
}
fn tick(engine: &mut Engine, delta: u64) {
    command(engine, json!({"op":"tick","delta_ms":delta}));
}
fn live(engine: &Engine) -> usize {
    engine.heap.live
}

#[test]
fn unreachable_cycle_is_collected_but_a_root_protects_it() {
    let mut engine = loaded(10);
    let run = start(&mut engine, json!({"id":1}));
    let handle: Handle = serde_json::from_value(run["handle"].clone()).unwrap();
    tick(&mut engine, 10);
    let run_object = match engine.heap.get(handle).unwrap() {
        Object::Run(run) => run,
        _ => panic!(),
    };
    let task = run_object.tasks[0];
    assert!(engine
        .heap
        .get(task)
        .unwrap()
        .references()
        .contains(&handle));
    assert!(engine
        .heap
        .get(handle)
        .unwrap()
        .references()
        .contains(&task));
    let cycle = engine.collect();
    assert!(cycle.marked > 0);
    assert!(engine.heap.get(handle).is_some());
    tick(&mut engine, RETENTION + 1);
    engine.collect();
    assert_eq!(live(&engine), 0);
    assert!(engine.heap.get(handle).is_none());
}

#[test]
fn scheduler_continuation_roots_capture_run_and_values() {
    let mut engine = loaded(1000);
    let run = start(&mut engine, json!({"message":"kept"}));
    tick(&mut engine, 0);
    assert_eq!(engine.state()["runs"][0]["status"], "waiting");
    // Remove the active root only to test the independent scheduler root.
    let active = engine.active.clone();
    engine.active.clear();
    engine.collect();
    let event = &engine.events.peek().unwrap().0;
    let continuation = match engine.heap.get(event.continuation).unwrap() {
        Object::Continuation(c) => c,
        _ => panic!(),
    };
    assert_eq!(engine.value(Some(continuation.value))["message"], "kept");
    assert!(engine.heap.get(continuation.run).is_some());
    engine.active = active;
    tick(&mut engine, 1000);
    let detail = command(&mut engine, json!({"op":"run","run_id":run["id"]}));
    assert_eq!(detail["status"], "completed");
    assert_eq!(detail["result"]["answer"], 42);
    assert_eq!(detail["tasks"][2]["completed_at"], 1000);
}

#[test]
fn generation_reuse_stale_handle_and_reset_are_safe() {
    let mut engine = loaded(0);
    let old = start(&mut engine, json!({}));
    let h: Handle = serde_json::from_value(old["handle"].clone()).unwrap();
    command(&mut engine, json!({"op":"reset"}));
    assert!(engine.heap.get(h).is_none());
    let fresh = start(&mut engine, json!({}));
    assert_ne!(old["id"], fresh["id"]);
    let inspection = command(&mut engine, json!({"op":"inspect","handle":h}));
    assert_eq!(inspection["valid"], false);
    let fresh_inspection = command(
        &mut engine,
        json!({"op":"inspect","handle":fresh["handle"]}),
    );
    assert_eq!(fresh_inspection["valid"], true);
    assert!(engine.heap.reused > 0);
}

#[test]
fn generation_overflow_retires_slot_forever() {
    let mut heap = Heap::new();
    let h = heap.alloc(Object::Value(json!({}))).unwrap();
    heap.slots[h.index as usize].generation = u32::MAX;
    let exhausted = Handle {
        index: h.index,
        generation: u32::MAX,
    };
    assert!(heap.get(exhausted).is_some());
    heap.release(h.index as usize);
    assert!(heap.slots[0].retired);
    assert!(heap.get(exhausted).is_none());
    let new = heap.alloc(Object::Value(json!({}))).unwrap();
    assert_ne!(new.index, h.index);
    assert!(heap.free.is_empty());
}

#[test]
fn malformed_and_out_of_bounds_handles_do_not_panic() {
    let mut engine = Engine::new();
    for handle in [
        json!({"index":-1,"generation":1}),
        json!({"index":0.5,"generation":1}),
        json!({"index":4_294_967_296u64,"generation":1}),
        json!({"index":0}),
        json!({"index":0,"generation":1,"bad":true}),
    ] {
        let response: Value = serde_json::from_str(
            &engine.dispatch_json(&json!({"op":"inspect","handle":handle}).to_string()),
        )
        .unwrap();
        assert_eq!(response["ok"], false);
    }
    assert_eq!(
        command(
            &mut engine,
            json!({"op":"inspect","handle":{"index":u32::MAX,"generation":1}})
        )["valid"],
        false
    );
}

#[test]
fn pause_step_resume_and_cancellation() {
    let mut engine = loaded(100);
    let run = start(&mut engine, json!({}));
    command(&mut engine, json!({"op":"pause"}));
    tick(&mut engine, 100);
    assert_eq!(engine.now, 0);
    assert_eq!(engine.events.len(), 1);
    command(&mut engine, json!({"op":"step","delta_ms":0}));
    assert!(engine.paused);
    assert_eq!(engine.state()["runs"][0]["status"], "waiting");
    command(&mut engine, json!({"op":"cancel","run_id":run["id"]}));
    assert!(engine.events.is_empty());
    assert!(engine.active.is_empty());
    assert_eq!(engine.state()["runs"][0]["status"], "cancelled");
    command(&mut engine, json!({"op":"resume"}));
    tick(&mut engine, 100);
    assert_eq!(engine.now, 100);
}

#[test]
fn concurrent_runs_are_isolated_and_equal_due_events_are_deterministic() {
    let mut engine = loaded(100);
    let first = start(&mut engine, json!({"value":1}));
    let second = start(&mut engine, json!({"value":2}));
    tick(&mut engine, 0);
    assert_eq!(engine.active.len(), 2);
    let mut events = engine.events.clone();
    let a = events.pop().unwrap().0;
    let b = events.pop().unwrap().0;
    assert_eq!(a.due, b.due);
    assert!(a.sequence < b.sequence);
    tick(&mut engine, 100);
    assert_eq!(
        command(&mut engine, json!({"op":"run","run_id":first["id"]}))["result"]["value"],
        1
    );
    assert_eq!(
        command(&mut engine, json!({"op":"run","run_id":second["id"]}))["result"]["value"],
        2
    );
    assert_eq!(engine.completed_runs, 2);
}

#[test]
fn branches_follow_true_and_false_edges() {
    let w = Workflow {
        id: "branches".into(),
        name: "Branches".into(),
        nodes: vec![
            node("t", "trigger", json!({})),
            node(
                "c",
                "condition",
                json!({"field":"score","operator":"gte","value":10}),
            ),
            node("yes", "output", json!({})),
            node("no", "output", json!({})),
        ],
        edges: vec![
            edge("a", "t", "c", None),
            edge("b", "c", "yes", Some("true")),
            edge("c", "c", "no", Some("false")),
        ],
    };
    let mut engine = Engine::new();
    command(&mut engine, json!({"op":"load","workflow":w}));
    for (score, target) in [(12, "yes"), (4, "no")] {
        let run = start(&mut engine, json!({"score":score}));
        tick(&mut engine, 0);
        let detail = command(&mut engine, json!({"op":"run","run_id":run["id"]}));
        assert_eq!(detail["tasks"][2]["node_id"], target);
    }
}

#[test]
fn validation_rejects_cycles_joins_missing_branches_and_bad_configs() {
    let valid = workflow(1);
    assert!(validate(&valid).is_empty());
    let mut w = valid.clone();
    w.edges.push(edge("cycle", "output", "trigger", None));
    assert!(!validate(&w).is_empty());
    let mut w = valid.clone();
    w.edges.push(edge("join", "trigger", "delay", None));
    assert!(!validate(&w).is_empty());
    let mut w = valid.clone();
    w.nodes[1].kind = "condition".into();
    w.nodes[1].config = json!({"field":"x","operator":"eq","value":1});
    assert!(!validate(&w).is_empty());
    let mut w = valid.clone();
    w.nodes[2].config = json!({"duration_ms":-1});
    assert!(!validate(&w).is_empty());
    let mut w = valid;
    w.nodes.push(node("orphan", "output", json!({})));
    assert!(!validate(&w).is_empty());
}

#[test]
fn workflow_reload_does_not_change_existing_runs() {
    let mut engine = loaded(100);
    let run = start(&mut engine, json!({}));
    tick(&mut engine, 0);
    let mut changed = workflow(0);
    changed.name = "New version".into();
    changed.nodes[1].config = json!({"field":"answer","value":99});
    command(&mut engine, json!({"op":"load","workflow":changed}));
    tick(&mut engine, 100);
    let detail = command(&mut engine, json!({"op":"run","run_id":run["id"]}));
    assert_eq!(detail["name"], "Test");
    assert_eq!(detail["result"]["answer"], 42);
}

#[test]
fn pin_retains_completed_run_until_unpinned() {
    let mut engine = loaded(0);
    let run = start(&mut engine, json!({}));
    tick(&mut engine, 0);
    command(
        &mut engine,
        json!({"op":"pin","run_id":run["id"],"pinned":true}),
    );
    tick(&mut engine, RETENTION + 1);
    engine.collect();
    assert!(live(&engine) > 0);
    assert_eq!(engine.state()["pinned_runs"], 1);
    command(&mut engine, json!({"op":"clear_diagnostics"}));
    engine.collect();
    assert!(engine.find_run(run["id"].as_u64().unwrap()).is_some());
    command(
        &mut engine,
        json!({"op":"pin","run_id":run["id"],"pinned":false}),
    );
    engine.collect();
    assert_eq!(live(&engine), 0);
}

#[test]
fn failed_transform_and_payload_growth_are_bounded() {
    let mut engine = Engine::new();
    let mut w = workflow(0);
    w.nodes[1].config = json!({"field":"new","value":"x".repeat(9000)});
    command(&mut engine, json!({"op":"load","workflow":w}));
    let run = start(&mut engine, json!({"old":"y".repeat(9000)}));
    tick(&mut engine, 0);
    let detail = command(&mut engine, json!({"op":"run","run_id":run["id"]}));
    assert_eq!(detail["status"], "failed");
    assert!(detail["error"]
        .as_str()
        .unwrap()
        .contains("Payload exceeds"));
    assert!(engine.events.is_empty());
    let response: Value = serde_json::from_str(&engine.dispatch_json(
        &json!({"op":"start","input":{"large":"z".repeat(MAX_PAYLOAD)}}).to_string(),
    ))
    .unwrap();
    assert_eq!(response["ok"], false);
}

#[test]
fn active_run_limit_and_virtual_time_validation() {
    let mut engine = loaded(60_000);
    for _ in 0..MAX_RUNS {
        start(&mut engine, json!({}));
    }
    let response: Value =
        serde_json::from_str(&engine.dispatch_json(r#"{"op":"start","input":{}}"#)).unwrap();
    assert_eq!(response["ok"], false);
    for delta in [json!(-1), json!(60_001), json!(0.1), json!("10")] {
        let r: Value = serde_json::from_str(
            &engine.dispatch_json(&json!({"op":"tick","delta_ms":delta}).to_string()),
        )
        .unwrap();
        assert_eq!(r["ok"], false);
    }
    assert_eq!(engine.active.len(), MAX_RUNS);
}

#[test]
fn repeated_workload_reuses_slots_and_bounds_diagnostics() {
    let mut engine = loaded(10);
    let mut peak = 0;
    for batch in 0..40 {
        for i in 0..25 {
            start(&mut engine, json!({"batch":batch,"i":i}));
        }
        tick(&mut engine, 10);
        tick(&mut engine, RETENTION + 1);
        engine.collect();
        peak = peak.max(engine.heap.slots.len());
        assert_eq!(live(&engine), 0);
    }
    assert!(peak < 600);
    assert!(engine.heap.reused > 9000);
    assert_eq!(engine.history.len(), HISTORY);
    assert!(engine.gc_history.len() <= 60);
    assert_eq!(engine.completed_runs, 1000);
}

#[test]
fn automatic_gc_off_keeps_unreachable_objects_until_manual_collection() {
    let mut engine = loaded(0);
    command(&mut engine, json!({"op":"auto_gc","enabled":false}));
    start(&mut engine, json!({}));
    tick(&mut engine, RETENTION + 1);
    assert!(live(&engine) > 0);
    assert_eq!(engine.gc_cycles, 0);
    let cycle = engine.collect();
    assert_eq!(cycle.marked, 0);
    assert!(cycle.reclaimed > 0);
    assert_eq!(live(&engine), 0);
    assert!(cycle.pause_ms >= cycle.mark_ms);
    assert!(cycle.pause_ms >= cycle.sweep_ms);
    assert_eq!(cycle.swept, engine.heap.slots.len());
}

#[test]
fn heap_budget_failure_is_actionable_and_does_not_corrupt_existing_objects() {
    let mut heap = Heap::new();
    let first = heap.alloc(Object::Value(json!({"first":1}))).unwrap();
    heap.bytes = MAX_HEAP_BYTES;
    assert!(heap
        .alloc(Object::Value(json!({})))
        .unwrap_err()
        .contains("Heap safety limit"));
    assert!(heap.get(first).is_some());
}

#[test]
fn long_delay_chain_hits_run_timeout() {
    let mut w = workflow(60_000);
    w.nodes
        .insert(3, node("delay2", "delay", json!({"duration_ms":60_000})));
    w.edges[2].target = "delay2".into();
    w.edges.push(edge("d", "delay2", "output", None));
    let mut engine = Engine::new();
    command(&mut engine, json!({"op":"load","workflow":w}));
    start(&mut engine, json!({}));
    tick(&mut engine, 60_000);
    tick(&mut engine, 60_000);
    assert_eq!(engine.failed_runs, 1);
    assert!(engine.active.is_empty());
    assert!(engine.events.is_empty());
}

#[test]
fn query_limits_and_unknown_commands_are_checked() {
    let mut engine = loaded(0);
    start(&mut engine, json!({}));
    tick(&mut engine, 0);
    assert_eq!(
        command(&mut engine, json!({"op":"heap","limit":1}))["slots"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        command(&mut engine, json!({"op":"references","limit":1}))["objects"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        serde_json::from_str::<Value>(&engine.dispatch_json("not json")).unwrap()["ok"],
        false
    );
    assert_eq!(
        serde_json::from_str::<Value>(&engine.dispatch_json(r#"{"op":"anything"}"#)).unwrap()["ok"],
        false
    );
}

#[test]
fn numeric_condition_config_is_checked_before_execution() {
    let mut w = workflow(0);
    w.nodes[1].kind = "condition".into();
    w.nodes[1].config = json!({"field":"score","operator":"gte","value":"ten"});
    assert!(validate(&w)
        .iter()
        .any(|error| error.contains("numeric value")));
}

#[test]
fn clearing_diagnostics_preserves_runtime_roots_and_resets_counters() {
    let mut engine = loaded(0);
    let run = start(&mut engine, json!({"kept":"until retention expires"}));
    tick(&mut engine, 0);
    command(&mut engine, json!({"op":"clear_diagnostics"}));
    assert!(engine.history.is_empty());
    assert_eq!(engine.heap.allocations, 0);
    engine.collect();
    assert_eq!(
        command(&mut engine, json!({"op":"run","run_id":run["id"]}))["status"],
        "completed"
    );
    tick(&mut engine, RETENTION + 1);
    engine.collect();
    assert_eq!(live(&engine), 0);
}

#[test]
fn real_allocation_pressure_returns_error_then_recovers_after_collection() {
    let mut engine = loaded(0);
    command(&mut engine, json!({"op":"auto_gc","enabled":false}));
    let input = json!({"payload":"p".repeat(12_000)});
    let mut started = 0;
    let mut failed = false;
    for _ in 0..500 {
        let response: Value = serde_json::from_str(
            &engine.dispatch_json(&json!({"op":"start","input":input}).to_string()),
        )
        .unwrap();
        if response["ok"] == false {
            assert!(response["error"]
                .as_str()
                .unwrap()
                .contains("Heap safety limit"));
            failed = true;
            break;
        }
        started += 1;
        tick(&mut engine, 0);
    }
    assert!(failed);
    assert!(started > 0);
    assert!(engine.heap.bytes <= MAX_HEAP_BYTES);
    tick(&mut engine, RETENTION + 1);
    engine.collect();
    assert_eq!(live(&engine), 0);
    start(&mut engine, json!({"recovered":true}));
    tick(&mut engine, 0);
    assert_eq!(engine.state()["runs"][0]["result"]["recovered"], true);
}

#[test]
fn live_run_can_be_pinned_after_its_diagnostic_record_was_evicted() {
    let mut engine = loaded(0);
    command(&mut engine, json!({"op":"auto_gc","enabled":false}));
    let first = start(&mut engine, json!({"first":true}));
    tick(&mut engine, 0);
    for _ in 0..HISTORY {
        start(&mut engine, json!({}));
        tick(&mut engine, 0);
    }
    tick(&mut engine, RETENTION + 1);
    assert_eq!(engine.history.len(), HISTORY);
    assert!(engine.retained.is_empty());
    command(
        &mut engine,
        json!({"op":"pin","run_id":first["id"],"pinned":true}),
    );
    engine.collect();
    assert_eq!(engine.run_index.len(), 1);
    assert_eq!(
        command(&mut engine, json!({"op":"run","run_id":first["id"]}))["result"]["first"],
        true
    );
}
