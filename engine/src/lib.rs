//! FlowRuntime owns a tracing heap independently of Rust's ordinary allocation.
//! Handles are checked on every access; scheduler events, active runs, retention,
//! and explicit pins are the only roots. Collection happens at safe boundaries.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap, VecDeque};

const MAX_NODES: usize = 64;
const MAX_EVENTS: usize = 4096;
const MAX_RUNS: usize = 256;
const MAX_PAYLOAD: usize = 16_384;
const MAX_WORKFLOW: usize = 131_072;
const MAX_SLOTS: usize = 100_000;
const MAX_HEAP_BYTES: usize = 64 * 1024 * 1024;
const MAX_STEPS: usize = 100_000;
const MAX_VIRTUAL: u64 = 1_000_000_000_000;
const MAX_SAFE_ID: u64 = 9_007_199_254_740_991;
const RETENTION: u64 = 5000;
const HISTORY: usize = 100;
const MAX_HISTORY_BYTES: usize = 8 * 1024 * 1024;
const RUN_TIMEOUT: u64 = 120_000;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(deny_unknown_fields)]
pub struct Handle {
    pub index: u32,
    pub generation: u32,
}

mod diagnostics;
mod gc;
mod heap;
mod runtime;
mod workflow;

pub use gc::GcCycle;
use heap::*;
pub use runtime::Engine;
use workflow::{check_payload, encoded_len};
pub use workflow::{validate, Position, Workflow, WorkflowEdge, WorkflowNode};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct WasmEngine {
    inner: Engine,
}
#[cfg(target_arch = "wasm32")]
impl Default for WasmEngine {
    fn default() -> Self {
        Self::new()
    }
}
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmEngine {
        WasmEngine {
            inner: Engine::new(),
        }
    }
    pub fn dispatch(&mut self, request: &str) -> String {
        self.inner.dispatch_json(request)
    }
}

#[cfg(test)]
mod tests;
