import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import init, { WasmEngine } from "./wasm/flowruntime_engine";
import { templates } from "./templates";
import type {
  EngineState,
  GcCycle,
  Handle,
  HeapSnapshot,
  Inspection,
  ReferenceGraph,
  RunDetail,
  RunSummary,
  Validation,
  Workflow,
} from "./types";

beforeAll(async () => {
  const bytes = await readFile(
    new URL("./wasm/flowruntime_engine_bg.wasm", import.meta.url),
  );
  await init({ module_or_path: bytes });
});

function client() {
  const engine = new WasmEngine();
  const call = <T = unknown>(request: Record<string, unknown>): T => {
    const response = JSON.parse(engine.dispatch(JSON.stringify(request)));
    if (!response.ok) throw new Error(response.error);
    return response.data as T;
  };
  return { engine, call };
}
function usingEngine(fn: (call: ReturnType<typeof client>["call"]) => void) {
  const { engine, call } = client();
  try {
    fn(call);
  } finally {
    engine.free();
  }
}
function copyWorkflow(index = 0): Workflow {
  return structuredClone(templates[index].workflow);
}

describe("real Rust/WASM boundary", () => {
  it.each(templates)(
    "validates and executes $name through the exported engine",
    (template) =>
      usingEngine((call) => {
        expect(
          call<Validation>({ op: "validate", workflow: template.workflow }),
        ).toEqual({ valid: true, errors: [] });
        call({ op: "load", workflow: template.workflow });
        const run = call<RunSummary>({ op: "start", input: template.input });
        call({ op: "step", delta_ms: 4000 });
        const detail = call<RunDetail>({ op: "run", run_id: run.id });
        expect(detail.status).toBe("completed");
        expect(detail.tasks.length).toBeGreaterThan(2);
        expect(detail.result).toMatchObject(template.input);
        expect(detail.tasks.every((task) => task.status === "completed")).toBe(
          true,
        );
      }),
  );

  it("executes both condition routes rather than UI-provided results", () =>
    usingEngine((call) => {
      call({ op: "load", workflow: copyWorkflow() });
      for (const [amount, decision] of [
        [1250, "manual_review"],
        [20, "approved"],
      ] as const) {
        const run = call<RunSummary>({ op: "start", input: { amount } });
        call({ op: "step", delta_ms: 1 });
        expect(call<RunDetail>({ op: "run", run_id: run.id }).result).toEqual({
          amount,
          validated: true,
          decision,
        });
      }
    }));

  it("snapshots definitions independently of later editor changes", () =>
    usingEngine((call) => {
      const workflow = copyWorkflow();
      call({ op: "load", workflow });
      const first = call<RunSummary>({ op: "start", input: { amount: 3 } });
      workflow.nodes.find((node) => node.id === "auto-approve")!.config.value =
        "changed";
      call({ op: "load", workflow });
      const second = call<RunSummary>({ op: "start", input: { amount: 3 } });
      call({ op: "step", delta_ms: 1 });
      expect(
        call<RunDetail>({ op: "run", run_id: first.id }).result,
      ).toMatchObject({ decision: "approved" });
      expect(
        call<RunDetail>({ op: "run", run_id: second.id }).result,
      ).toMatchObject({ decision: "changed" });
    }));

  it("protects continuation captures and active cycles during collection", () =>
    usingEngine((call) => {
      call({ op: "load", workflow: copyWorkflow(1) });
      const run = call<RunSummary>({ op: "start", input: templates[1].input });
      call({ op: "step", delta_ms: 1 });
      const graph = call<ReferenceGraph>({ op: "references", run_id: run.id });
      expect(
        graph.objects.some((object) => object.kind === "Continuation"),
      ).toBe(true);
      const runObject = graph.objects.find((object) => object.kind === "Run")!;
      expect(
        graph.objects.some(
          (object) =>
            object.kind === "Task" &&
            object.references.some(
              (h) =>
                h.index === runObject.handle.index &&
                h.generation === runObject.handle.generation,
            ),
        ),
      ).toBe(true);
      call({ op: "collect" });
      expect(
        call<Inspection>({ op: "inspect", handle: run.handle }).valid,
      ).toBe(true);
      call({ op: "step", delta_ms: 3000 });
      expect(call<RunDetail>({ op: "run", run_id: run.id }).status).toBe(
        "completed",
      );
    }));

  it("retains pins, collects cycles after unpin, and rejects stale handles after reuse", () =>
    usingEngine((call) => {
      call({ op: "auto_gc", enabled: false });
      call({ op: "load", workflow: copyWorkflow() });
      const run = call<RunSummary>({ op: "start", input: { amount: 8 } });
      call({ op: "step", delta_ms: 1 });
      call({ op: "pin", run_id: run.id, pinned: true });
      call({ op: "step", delta_ms: 6000 });
      // Consumed scheduler continuations can be reclaimed even while a Run is pinned.
      const pinnedGraph = call<ReferenceGraph>({
        op: "references",
        run_id: run.id,
      });
      const pinnedCollection = call<GcCycle>({ op: "collect" });
      expect(pinnedCollection.marked).toBe(pinnedGraph.objects.length);
      for (const object of pinnedGraph.objects) {
        expect(
          call<Inspection>({ op: "inspect", handle: object.handle }).valid,
        ).toBe(true);
      }
      call({ op: "pin", run_id: run.id, pinned: false });
      expect(call<GcCycle>({ op: "collect" }).reclaimed).toBeGreaterThan(0);
      expect(
        call<Inspection>({ op: "inspect", handle: run.handle }).valid,
      ).toBe(false);
      expect(() => call({ op: "pin", run_id: run.id, pinned: true })).toThrow();
      call({ op: "start", input: { amount: 8 } });
      expect(
        call<EngineState>({ op: "state" }).heap.reused_slots,
      ).toBeGreaterThan(0);
      expect(
        call<Inspection>({ op: "inspect", handle: run.handle }).valid,
      ).toBe(false);
    }));

  it("does not promote inspected or selected handles to roots", () =>
    usingEngine((call) => {
      call({ op: "auto_gc", enabled: false });
      call({ op: "load", workflow: copyWorkflow() });
      const run = call<RunSummary>({ op: "start", input: {} });
      call({ op: "step", delta_ms: 6000 });
      const before = call<EngineState>({ op: "state" }).roots;
      call({ op: "inspect", handle: run.handle });
      call({ op: "references", run_id: run.id });
      expect(call<EngineState>({ op: "state" }).roots).toEqual(before);
      call({ op: "collect" });
      expect(
        call<Inspection>({ op: "inspect", handle: run.handle }).valid,
      ).toBe(false);
    }));

  it("pause prevents ticks, step advances deliberately, resume executes pending work", () =>
    usingEngine((call) => {
      call({ op: "load", workflow: copyWorkflow(1) });
      const run = call<RunSummary>({ op: "start", input: templates[1].input });
      call({ op: "pause" });
      const initial = call<EngineState>({ op: "state" }).now_ms;
      call({ op: "tick", delta_ms: 1000 });
      expect(call<EngineState>({ op: "state" }).now_ms).toBe(initial);
      call({ op: "step", delta_ms: 1000 });
      expect(call<EngineState>({ op: "state" }).paused).toBe(true);
      expect(call<RunDetail>({ op: "run", run_id: run.id }).status).toBe(
        "waiting",
      );
      call({ op: "resume" });
      call({ op: "tick", delta_ms: 3000 });
      expect(call<RunDetail>({ op: "run", run_id: run.id }).status).toBe(
        "completed",
      );
    }));

  it("reset invalidates saved handles and keeps the loaded workflow usable", () =>
    usingEngine((call) => {
      call({ op: "load", workflow: copyWorkflow() });
      const old = call<RunSummary>({ op: "start", input: {} });
      call({ op: "reset" });
      const fresh = call<RunSummary>({ op: "start", input: {} });
      expect(fresh.handle).not.toEqual(old.handle);
      expect(
        call<Inspection>({ op: "inspect", handle: old.handle }).valid,
      ).toBe(false);
      call({ op: "step", delta_ms: 1 });
      expect(call<RunDetail>({ op: "run", run_id: fresh.id }).status).toBe(
        "completed",
      );
    }));

  it("rejects malformed graphs, oversized inputs and bad handles safely", () =>
    usingEngine((call) => {
      const graph = copyWorkflow();
      graph.edges.push({
        id: "cycle",
        source: "approval-result",
        target: "new-order",
      });
      expect(call<Validation>({ op: "validate", workflow: graph }).valid).toBe(
        false,
      );
      const join = copyWorkflow();
      join.edges.push({
        id: "join",
        source: "manual-review",
        target: "approval-result",
      });
      expect(call<Validation>({ op: "validate", workflow: join }).valid).toBe(
        false,
      );
      call({ op: "load", workflow: copyWorkflow() });
      expect(() =>
        call({ op: "start", input: { data: "x".repeat(20_000) } }),
      ).toThrow();
      for (const handle of [
        { index: 99999, generation: 1 },
        { index: 0, generation: 0 },
      ] satisfies Handle[]) {
        expect(call<Inspection>({ op: "inspect", handle }).valid).toBe(false);
      }
    }));

  it("reports deliberate task failures and cancels delayed runs", () =>
    usingEngine((call) => {
      const graph = copyWorkflow();
      graph.nodes.find((node) => node.kind === "transform")!.config.fail = true;
      call({ op: "load", workflow: graph });
      const failure = call<RunSummary>({ op: "start", input: {} });
      call({ op: "step", delta_ms: 1 });
      const detail = call<RunDetail>({ op: "run", run_id: failure.id });
      expect(detail.status).toBe("failed");
      expect(detail.tasks.some((task) => task.error)).toBe(true);
      call({ op: "load", workflow: copyWorkflow(1) });
      const waiting = call<RunSummary>({
        op: "start",
        input: templates[1].input,
      });
      call({ op: "step", delta_ms: 1 });
      call({ op: "cancel", run_id: waiting.id });
      expect(call<RunDetail>({ op: "run", run_id: waiting.id }).status).toBe(
        "cancelled",
      );
      expect(call<EngineState>({ op: "state" }).pending_events).toBe(0);
    }));

  it("bounds histories and reuses capacity under repeated fixed workload", () =>
    usingEngine((call) => {
      call({ op: "load", workflow: copyWorkflow(2) });
      const capacities: number[] = [];
      for (let batch = 0; batch < 15; batch++) {
        for (let i = 0; i < 12; i++)
          call({ op: "start", input: { score: i * 10 } });
        call({ op: "step", delta_ms: 6000 });
        call({ op: "collect" });
        const state = call<EngineState>({ op: "state" });
        capacities.push(state.heap.capacity);
        expect(state.heap.live_objects).toBe(0);
        expect(state.runs.length).toBeLessThanOrEqual(
          state.limits.history_limit,
        );
        expect(state.gc.history.length).toBeLessThanOrEqual(60);
      }
      expect(new Set(capacities.slice(3)).size).toBe(1);
      const snapshot = call<HeapSnapshot>({ op: "heap", limit: 5 });
      expect(snapshot.slots.length).toBeLessThanOrEqual(5);
    }));
});
