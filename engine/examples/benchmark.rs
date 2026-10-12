//! Native fixed-workload benchmark. Run with cargo run --release --example benchmark.
use flowruntime_engine::Engine;
use serde_json::{json, Value};
use std::time::Instant;

fn dispatch(engine: &mut Engine, request: Value) -> Value {
    let response: Value =
        serde_json::from_str(&engine.dispatch_json(&request.to_string())).expect("engine JSON");
    assert_eq!(response["ok"], true, "{response}");
    response["data"].clone()
}
fn fixture() -> Value {
    let nodes:Vec<Value>=[("trigger","trigger",json!({})),("transform","transform",json!({"field":"checked","value":true})),("condition","condition",json!({"field":"score","operator":"gte","value":50})),("yes","transform",json!({"field":"route","value":"approved"})),("no","transform",json!({"field":"route","value":"review"})),("yes_delay","delay",json!({"duration_ms":100})),("no_delay","delay",json!({"duration_ms":100})),("yes_output","output",json!({})),("no_output","output",json!({}))].into_iter().map(|(id,kind,config)|json!({"id":id,"label":id,"kind":kind,"config":config,"position":{"x":0,"y":0}})).collect();
    let edges: Vec<Value> = [
        ("a", "trigger", "transform", None),
        ("b", "transform", "condition", None),
        ("c", "condition", "yes", Some("true")),
        ("d", "condition", "no", Some("false")),
        ("e", "yes", "yes_delay", None),
        ("f", "no", "no_delay", None),
        ("g", "yes_delay", "yes_output", None),
        ("h", "no_delay", "no_output", None),
    ]
    .into_iter()
    .map(|(id, source, target, branch)| {
        let mut e = json!({"id":id,"source":source,"target":target});
        if let Some(branch) = branch {
            e["branch"] = json!(branch)
        }
        e
    })
    .collect();
    json!({"id":"benchmark","name":"Fixed branching workload","nodes":nodes,"edges":edges})
}
fn main() {
    let mut results = Vec::new();
    for runs in [100, 1000, 10000] {
        for auto_gc in [true, false] {
            let mut engine = Engine::new();
            dispatch(&mut engine, json!({"op":"load","workflow":fixture()}));
            dispatch(&mut engine, json!({"op":"auto_gc","enabled":auto_gc}));
            let timer = Instant::now();
            let mut peak_live = 0u64;
            let mut peak_capacity = 0u64;
            let mut cycles: Vec<Value> = Vec::new();
            let mut last_cycle = 0;
            for base in (0..runs).step_by(100) {
                for index in base..(base + 100).min(runs) {
                    dispatch(
                        &mut engine,
                        json!({"op":"start","input":{"index":index,"score":index%100,"source":"fixed-native-benchmark"}}),
                    );
                }
                dispatch(&mut engine, json!({"op":"tick","delta_ms":200}));
                let state = engine.state();
                peak_live = peak_live.max(state["heap"]["live_objects"].as_u64().unwrap());
                peak_capacity = peak_capacity.max(state["heap"]["capacity"].as_u64().unwrap());
                dispatch(&mut engine, json!({"op":"tick","delta_ms":5001}));
                // The OFF scenario collects explicitly at a fixed batch boundary to respect caps.
                if !auto_gc {
                    dispatch(&mut engine, json!({"op":"collect"}));
                }
                let snapshot = engine.state();
                for cycle in snapshot["gc"]["history"].as_array().unwrap() {
                    let number = cycle["cycle"].as_u64().unwrap();
                    if number > last_cycle {
                        cycles.push(cycle.clone());
                        last_cycle = number;
                    }
                }
            }
            let state = engine.state();
            assert_eq!(state["completed_runs"], runs);
            assert_eq!(state["failed_runs"], 0);
            assert_eq!(state["active_runs"], 0);
            assert_eq!(cycles.len() as u64, state["gc"]["cycles"].as_u64().unwrap());
            let mut pauses: Vec<f64> = cycles
                .iter()
                .map(|cycle| cycle["pause_ms"].as_f64().unwrap())
                .collect();
            pauses.sort_by(f64::total_cmp);
            let mark_total: f64 = cycles
                .iter()
                .map(|cycle| cycle["mark_ms"].as_f64().unwrap())
                .sum();
            let sweep_total: f64 = cycles
                .iter()
                .map(|cycle| cycle["sweep_ms"].as_f64().unwrap())
                .sum();
            let wall_ms = timer.elapsed().as_secs_f64() * 1000.0;
            let p95 = pauses[((pauses.len() as f64 * 0.95).ceil() as usize).saturating_sub(1)];
            results.push(json!({"runs":runs,"auto_gc":auto_gc,"batch_size":100,"wall_ms":wall_ms,"runs_per_second":runs as f64/wall_ms*1000.0,"sampled_peak_live_objects":peak_live,"sampled_peak_capacity":peak_capacity,"final_heap":state["heap"],"gc_cycles":state["gc"]["cycles"],"gc_cumulative_ms":state["gc"]["cumulative_ms"],"gc_mark_total_ms":mark_total,"gc_sweep_total_ms":sweep_total,"gc_pause_p95_ms":p95,"gc_pause_max_ms":pauses.last(),"manual_gc_policy":if auto_gc {"none"} else {"after each batch and retention expiration"}}));
        }
    }
    println!("{}",serde_json::to_string_pretty(&json!({"runtime":"native Rust","fixture":"9-node branch/delay DAG; 6 nodes executed per run","timing":"Instant wall clock, includes JSON command/response serialization and bounded diagnostics sampling","memory_sampling":"Live objects and slot capacity sampled after each batch finishes, before retention expiration; not process RSS","scenarios":results})).unwrap());
}
