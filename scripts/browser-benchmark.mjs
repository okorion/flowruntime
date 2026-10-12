import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(projectRoot, "web/package.json"));
const { chromium } = require("@playwright/test");
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5174";
const outputPath = resolve(projectRoot, "docs/benchmarks/browser.json");
const workloads = process.env.BENCHMARK_RUNS
  ? process.env.BENCHMARK_RUNS.split(",").map(Number)
  : [100, 1000, 10000];
if (
  workloads.some(
    (count) => !Number.isSafeInteger(count) || count < 1 || count > 10000,
  )
) {
  throw new Error("BENCHMARK_RUNS must contain integers from 1 through 10000");
}
const browser = await chromium.launch();
const results = [];
try {
  for (const runCount of workloads) {
    for (const autoGc of [true, false]) {
      // A fresh page gives each sample its own WebAssembly instance/linear memory.
      const page = await browser.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page
        .getByTestId("runtime-status")
        .filter({ hasText: "Rust / WASM" })
        .waitFor();
      const result = await page.evaluate(
        async ({ runCount, autoGc }) => {
          const { default: init, WasmEngine } = await import(
            "/src/wasm/flowruntime_engine.js"
          );
          const wasm = await init();
          const engine = new WasmEngine();
          const request = (command) => {
            const response = JSON.parse(
              engine.dispatch(JSON.stringify(command)),
            );
            if (!response.ok)
              throw new Error(`${command.op}: ${response.error}`);
            return response.data;
          };
          const assert = (condition, message) => {
            if (!condition) throw new Error(message);
          };
          const node = (id, kind, config = {}) => ({
            id,
            label: id,
            kind,
            config,
            position: { x: 0, y: 0 },
          });
          const edge = (source, target, branch) => ({
            id: `${source}-${target}`,
            source,
            target,
            ...(branch ? { branch } : {}),
          });
          const workflow = {
            id: "benchmark-branch-delay",
            name: "Benchmark branch + continuation",
            nodes: [
              node("trigger", "trigger"),
              node("normalize", "transform", {
                field: "normalized",
                value: true,
              }),
              node("route", "condition", {
                field: "amount",
                operator: "gte",
                value: 500,
              }),
              node("review", "transform", { field: "route", value: "review" }),
              node("approve", "transform", {
                field: "route",
                value: "approved",
              }),
              node("review-delay", "delay", { duration_ms: 100 }),
              node("approve-delay", "delay", { duration_ms: 100 }),
              node("review-output", "output"),
              node("approve-output", "output"),
            ],
            edges: [
              edge("trigger", "normalize"),
              edge("normalize", "route"),
              edge("route", "review", "true"),
              edge("route", "approve", "false"),
              edge("review", "review-delay"),
              edge("approve", "approve-delay"),
              edge("review-delay", "review-output"),
              edge("approve-delay", "approve-output"),
            ],
          };
          try {
            request({ op: "load", workflow });
            request({ op: "pause" });
            const retentionMs = request({ op: "state" }).limits.retention_ms;
            // Warm the exact execution/collection path; reset measured counters afterwards.
            for (let i = 0; i < 20; i++)
              request({
                op: "start",
                input: { amount: i % 2 ? 800 : 80, sequence: i },
              });
            request({ op: "step", delta_ms: 200 });
            request({ op: "step", delta_ms: retentionMs + 1 });
            request({ op: "collect" });
            request({ op: "reset" });
            request({ op: "pause" });
            request({ op: "auto_gc", enabled: autoGc });
            const baseline = request({ op: "state" });
            const linearBefore = wasm.memory.buffer.byteLength;
            const idleTimers = [];
            for (let i = 0; i < 5; i++) {
              const start = performance.now();
              await new Promise((done) => setTimeout(done, 0));
              idleTimers.push(performance.now() - start);
            }
            let executionMs = 0;
            let startDispatchMs = 0;
            let virtualStepMs = 0;
            let manualCollectionMs = 0;
            let peakLiveObjects = baseline.heap.live_objects;
            let peakCapacity = baseline.heap.capacity;
            let linearHighWater = linearBefore;
            const cycles = new Map();
            const batches = [];
            const observe = () => {
              const state = request({ op: "state" });
              for (const cycle of state.gc.history)
                cycles.set(cycle.cycle, cycle);
              peakLiveObjects = Math.max(
                peakLiveObjects,
                state.heap.live_objects,
              );
              peakCapacity = Math.max(peakCapacity, state.heap.capacity);
              linearHighWater = Math.max(
                linearHighWater,
                wasm.memory.buffer.byteLength,
              );
              return state;
            };
            const wallStart = performance.now();
            for (let offset = 0; offset < runCount; offset += 100) {
              const count = Math.min(100, runCount - offset);
              const batchStart = performance.now();
              const timer = new Promise((done) =>
                setTimeout(() => done(performance.now() - batchStart), 0),
              );
              let firstRun;
              const startsAt = performance.now();
              for (let j = 0; j < count; j++) {
                const run = request({
                  op: "start",
                  input: {
                    amount: (offset + j) % 2 ? 800 : 80,
                    sequence: offset + j,
                  },
                });
                firstRun ??= run;
              }
              startDispatchMs += performance.now() - startsAt;
              const waiting = observe();
              assert(
                waiting.active_runs === count,
                "All runs must wait on real delay continuations",
              );
              const stepAt = performance.now();
              request({ op: "step", delta_ms: 200 });
              virtualStepMs += performance.now() - stepAt;
              const completed = observe();
              assert(
                completed.active_runs === 0 && completed.pending_events === 0,
                "Batch did not finish",
              );
              const detail = request({ op: "run", run_id: firstRun.id });
              assert(
                detail.status === "completed" &&
                  detail.result.normalized === true,
                "Incorrect transform output",
              );
              assert(
                detail.result.route === (offset % 2 ? "review" : "approved"),
                "Incorrect branch output",
              );
              const expiryAt = performance.now();
              request({ op: "step", delta_ms: retentionMs + 1 });
              virtualStepMs += performance.now() - expiryAt;
              const expired = observe();
              if (!autoGc) {
                const gcAt = performance.now();
                request({ op: "collect" });
                manualCollectionMs += performance.now() - gcAt;
              }
              const after = observe();
              assert(
                after.roots.length === 0,
                "Expired workload retains roots",
              );
              assert(
                after.runs.length <= after.limits.history_limit,
                "Run history exceeded diagnostic limit",
              );
              const syncMs = performance.now() - batchStart;
              const timerDelayMs = await timer;
              batches.push({
                runs_completed: offset + count,
                synchronous_ms: syncMs,
                timer_delay_ms: timerDelayMs,
                live_before_expiry: completed.heap.live_objects,
                live_after_expiry_before_manual_gc: expired.heap.live_objects,
                live_after_batch: after.heap.live_objects,
                heap_capacity: after.heap.capacity,
                slots_reused: after.heap.reused_slots,
                gc_cycles: after.gc.cycles,
                wasm_linear_memory_bytes: wasm.memory.buffer.byteLength,
              });
            }
            const finalGcAt = performance.now();
            request({ op: "collect" });
            manualCollectionMs += performance.now() - finalGcAt;
            const final = observe();
            executionMs = startDispatchMs + virtualStepMs;
            assert(
              final.heap.live_objects === 0,
              "Final collection left unrooted runtime objects",
            );
            assert(
              final.completed_runs === runCount,
              "Completed run counter does not match workload",
            );
            assert(final.failed_runs === 0, "Unexpected workflow failure");
            assert(final.heap.reused_slots > 0, "Slot reuse was not observed");
            const orderedCycles = [...cycles.values()].sort(
              (a, b) => a.cycle - b.cycle,
            );
            const cycleCoverage =
              orderedCycles.length === final.gc.cycles - baseline.gc.cycles;
            assert(
              cycleCoverage,
              "Bounded GC history dropped a cycle; reduce benchmark batch size",
            );
            const timings = batches
              .map((batch) => batch.timer_delay_ms)
              .sort((a, b) => a - b);
            return {
              runs: runCount,
              auto_gc: autoGc,
              batch_size: 100,
              warmup_runs: 20,
              retention_ms: retentionMs,
              workload_wall_ms: performance.now() - wallStart,
              workflow_dispatch_ms: executionMs,
              start_dispatch_ms: startDispatchMs,
              virtual_step_ms: virtualStepMs,
              manual_collection_dispatch_ms: manualCollectionMs,
              runtime_allocations:
                final.heap.allocations - baseline.heap.allocations,
              gc_cycles: final.gc.cycles - baseline.gc.cycles,
              gc_mark_ms: orderedCycles.reduce(
                (sum, cycle) => sum + cycle.mark_ms,
                0,
              ),
              gc_sweep_ms: orderedCycles.reduce(
                (sum, cycle) => sum + cycle.sweep_ms,
                0,
              ),
              gc_pause_ms: final.gc.cumulative_ms - baseline.gc.cumulative_ms,
              gc_max_pause_ms: Math.max(
                0,
                ...orderedCycles.map((cycle) => cycle.pause_ms),
              ),
              objects_reclaimed:
                final.gc.total_reclaimed - baseline.gc.total_reclaimed,
              peak_observed_live_objects: peakLiveObjects,
              final_live_objects: final.heap.live_objects,
              heap_capacity: final.heap.capacity,
              peak_heap_capacity: peakCapacity,
              free_slots: final.heap.free_slots,
              slots_reused:
                final.heap.reused_slots - baseline.heap.reused_slots,
              wasm_linear_memory_before_bytes: linearBefore,
              wasm_linear_memory_after_bytes: wasm.memory.buffer.byteLength,
              wasm_linear_memory_high_water_bytes: linearHighWater,
              idle_timer_delays_ms: idleTimers,
              batch_timer_delay_median_ms:
                timings[Math.floor(timings.length / 2)],
              batch_timer_delay_p95_ms:
                timings[
                  Math.min(
                    timings.length - 1,
                    Math.ceil(timings.length * 0.95) - 1,
                  )
                ],
              batch_timer_delay_max_ms: timings.at(-1),
              diagnostic_run_count: final.runs.length,
              diagnostic_gc_count: final.gc.history.length,
              all_gc_cycles_observed: cycleCoverage,
              batches,
              gc_cycle_details: orderedCycles,
            };
          } finally {
            engine.free();
          }
        },
        { runCount, autoGc },
      );
      results.push(result);
      console.log(
        JSON.stringify({
          runs: runCount,
          auto_gc: autoGc,
          workflow_dispatch_ms: result.workflow_dispatch_ms,
          gc_pause_ms: result.gc_pause_ms,
          heap_capacity: result.heap_capacity,
          slots_reused: result.slots_reused,
        }),
      );
      await page.close();
    }
  }
  const report = {
    measured_at: new Date().toISOString(),
    timezone: "Asia/Seoul",
    environment: {
      browser: browser.version(),
      node: process.version,
      os: os.type(),
      release: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model,
      logical_cpus: os.cpus().length,
    },
    methodology: {
      target:
        "Actual release Rust/WASM WasmEngine through JSON dispatch in headless Chromium with the FlowRuntime UI loaded",
      workflow:
        "Trigger -> Transform -> Condition -> branch Transform -> 100 ms Delay -> Output; alternating routes",
      scheduling:
        "At most 100 concurrent runs, step 200 virtual ms, then retention + 1 virtual ms per batch",
      gc_off:
        "Automatic GC disabled; manual collection at every batch boundary and at the final boundary to respect heap safety limits",
      timer_delay:
        "setTimeout(0) scheduled before each synchronous workload batch; measures event-loop delay including dispatch, diagnostic queries and GC",
      dispatch_time:
        "Sums start and virtual-time dispatch calls; automatic GC is included when triggered in these calls",
      gc_time:
        "Engine Performance.now measurements; GC time overlaps dispatch time and must not be added to it",
      memory:
        "WASM linear memory is allocator high-water capacity; collection releases managed slots; allocated linear-memory pages remain available for reuse",
      isolation:
        "Fresh browser page and WASM instance per scenario; 20 unmeasured warmup runs before engine counter reset",
      repetitions: 1,
    },
    results,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${outputPath}`);
} finally {
  await browser.close();
}
