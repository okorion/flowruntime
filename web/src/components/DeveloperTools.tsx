import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle as FlowHandle,
  MarkerType,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import type { EngineClient } from "../engine";
import type {
  EngineState,
  GcCycle,
  Handle,
  HeapSnapshot,
  Inspection,
  ObjectView,
  ReferenceGraph,
} from "../types";
import {
  Badge,
  bytes,
  duration,
  Empty,
  handleId,
  Icon,
  JsonBlock,
  Metric,
  ms,
  number,
  Sparkline,
} from "./ui";

export type DeveloperTab = "heap" | "gc" | "references";
export interface MemorySample {
  now: number;
  live: number;
  free: number;
  capacity: number;
  bytes: number;
}
interface DeveloperProps {
  engine: EngineClient;
  state: EngineState;
  memoryBytes: number;
  samples: MemorySample[];
  revision: number;
  tab: DeveloperTab;
  onTab: (tab: DeveloperTab) => void;
  selectedHandle: Handle | null;
  onHandle: (handle: Handle) => void;
  referenceRun: number | null;
  onReferenceRun: (id: number | null) => void;
  onCommand: (command: Record<string, unknown>) => void;
  onRefresh: () => void;
  onError: (error: string) => void;
}
type Comparison = {
  before: HeapSnapshot;
  after: HeapSnapshot;
  cycle: GcCycle;
  roundTripMs: number;
};
const objectColors: Record<string, string> = {
  Run: "#75dcba",
  Task: "#83aef0",
  Value: "#c39cec",
  Continuation: "#e2b873",
};

export function DeveloperTools({
  engine,
  state,
  memoryBytes,
  samples,
  revision,
  tab,
  onTab,
  selectedHandle,
  onHandle,
  referenceRun,
  onReferenceRun,
  onCommand,
  onRefresh,
  onError,
}: DeveloperProps) {
  const [heap, setHeap] = useState<HeapSnapshot | null>(null);
  const [graph, setGraph] = useState<ReferenceGraph | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [lastKnown, setLastKnown] = useState<ObjectView | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const previousCycles = useRef(state.gc.cycles);
  useEffect(() => {
    if (state.gc.cycles < previousCycles.current) setComparison(null);
    previousCycles.current = state.gc.cycles;
  }, [state.gc.cycles]);
  useEffect(() => {
    try {
      if (tab === "heap")
        setHeap(engine.request<HeapSnapshot>({ op: "heap", limit: 256 }));
      if (tab === "references")
        setGraph(
          engine.request<ReferenceGraph>({
            op: "references",
            ...(referenceRun == null ? {} : { run_id: referenceRun }),
            limit: 80,
          }),
        );
      setQueryError(null);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : String(error));
    }
  }, [engine, revision, tab, referenceRun]);
  useEffect(() => {
    if (!selectedHandle) {
      setInspection(null);
      return;
    }
    try {
      const result = engine.request<Inspection>({
        op: "inspect",
        handle: selectedHandle,
      });
      setInspection(result);
      if (result.valid && result.object) setLastKnown(result.object);
    } catch (error) {
      setInspection({
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [engine, revision, selectedHandle]);
  const collect = () => {
    try {
      const before = engine.request<HeapSnapshot>({ op: "heap", limit: 256 });
      const start = performance.now();
      const cycle = engine.request<GcCycle>({ op: "collect" });
      const roundTripMs = performance.now() - start;
      const after = engine.request<HeapSnapshot>({ op: "heap", limit: 256 });
      setComparison({ before, after, cycle, roundTripMs });
      setHeap(after);
      onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  const known =
    selectedHandle &&
    lastKnown &&
    handleId(lastKnown.handle) === handleId(selectedHandle)
      ? lastKnown
      : null;
  return (
    <div className="developer-layout">
      <div className="dev-toolbar">
        <div className="dev-tabs" role="tablist" aria-label="Developer tool">
          <button
            className={tab === "heap" ? "active" : ""}
            role="tab"
            aria-selected={tab === "heap"}
            onClick={() => onTab("heap")}
          >
            <Icon name="layers" size={16} />
            Heap
          </button>
          <button
            className={tab === "gc" ? "active" : ""}
            role="tab"
            aria-selected={tab === "gc"}
            onClick={() => onTab("gc")}
          >
            <Icon name="reset" size={16} />
            Garbage Collection
          </button>
          <button
            className={tab === "references" ? "active" : ""}
            role="tab"
            aria-selected={tab === "references"}
            onClick={() => onTab("references")}
          >
            <Icon name="workflow" size={16} />
            References
          </button>
        </div>
        <div className="dev-controls">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={state.auto_gc}
              onChange={(event) =>
                onCommand({ op: "auto_gc", enabled: event.target.checked })
              }
              aria-label="Auto GC"
            />
            <span className="toggle-track" />
            Auto GC
          </label>
          <span className="toolbar-separator" />
          <button
            className="button button-small"
            onClick={() => onCommand({ op: "step", delta_ms: 5000 })}
            title="Advance virtual time by 5 seconds and pause"
          >
            <Icon name="step" size={14} />
            Advance 5 seconds
          </button>
          <button
            className="button button-small button-primary-soft"
            onClick={collect}
          >
            <Icon name="reset" size={14} />
            Collect garbage
          </button>
        </div>
      </div>
      {queryError && (
        <div className="notice notice-error" role="alert">
          {queryError}
        </div>
      )}
      <div className={`dev-content ${tab === "gc" ? "dev-content-wide" : ""}`}>
        <div className="dev-main">
          {tab === "heap" && (
            <>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">RUNTIME MEMORY</div>
                  <h2>Every object, accounted for.</h2>
                  <p>The generational heap behind your workflow executions.</p>
                </div>
                <Badge tone="completed">Live engine</Badge>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="Occupied slots"
                  value={
                    <span data-testid="live-objects">
                      {number(state.heap.live_objects)}
                    </span>
                  }
                  detail={`${number(state.heap.capacity)} capacity · ${state.retained_runs} retained / ${state.pinned_runs} pinned runs`}
                  accent="#72d8b7"
                />
                <Metric
                  label="Free slots"
                  value={number(state.heap.free_slots)}
                  detail="Available for reuse"
                />
                <Metric
                  label="Slot reuses"
                  value={number(state.heap.reused_slots)}
                  detail={`${number(state.heap.allocations)} managed allocations`}
                />
                <Metric
                  label="WASM linear memory"
                  value={bytes(memoryBytes)}
                  detail="Committed byte length"
                  accent="#a8b0f4"
                />
              </div>
              <div className="heap-charts">
                <section className="panel">
                  <div className="panel-title">
                    <h3>Managed object count</h3>
                    <span className="chart-legend">
                      <i />
                      Occupied
                      <i className="capacity" />
                      Capacity
                      <i className="free" />
                      Free
                    </span>
                  </div>
                  <div className="dual-chart">
                    <Sparkline
                      values={samples.map((sample) => sample.capacity)}
                      color="#647082"
                      ceiling={Math.max(
                        1,
                        ...samples.map((sample) => sample.capacity),
                      )}
                    />
                    <div className="chart-overlay">
                      <Sparkline
                        values={samples.map((sample) => sample.live)}
                        color="#70e0bc"
                        area={false}
                        ceiling={Math.max(
                          1,
                          ...samples.map((sample) => sample.capacity),
                        )}
                      />
                    </div>
                    <div className="chart-overlay">
                      <Sparkline
                        values={samples.map((sample) => sample.free)}
                        color="#c6a7df"
                        area={false}
                        ceiling={Math.max(
                          1,
                          ...samples.map((sample) => sample.capacity),
                        )}
                      />
                    </div>
                  </div>
                  <div className="chart-foot">
                    <span>
                      {samples.length ? duration(samples[0].now) : "0 ms"}
                    </span>
                    <span>Last {samples.length} samples · virtual time</span>
                    <span>{duration(state.now_ms)}</span>
                  </div>
                  <p className="chart-note">
                    Shared scale: 0–
                    {number(
                      Math.max(1, ...samples.map((sample) => sample.capacity)),
                    )}{" "}
                    slots. One sample per second.
                  </p>
                </section>
                <section className="panel allocation-panel">
                  <div className="panel-title">
                    <h3>Objects by type</h3>
                    <span>{state.heap.live_objects}</span>
                  </div>
                  {["Run", "Task", "Value", "Continuation"].map((kind) => (
                    <div className="type-row" key={kind}>
                      <div>
                        <span
                          className="type-dot"
                          style={{ background: objectColors[kind] }}
                        />
                        <span>{kind}</span>
                        <strong>{number(state.heap.by_type[kind] ?? 0)}</strong>
                      </div>
                      <div className="type-bar">
                        <span
                          style={{
                            width: `${state.heap.live_objects ? ((state.heap.by_type[kind] ?? 0) / state.heap.live_objects) * 100 : 0}%`,
                            background: objectColors[kind],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel linear-memory-panel">
                <div className="panel-title">
                  <h3>WASM linear memory</h3>
                  <span>
                    {bytes(memoryBytes)} current ·{" "}
                    {bytes(
                      Math.max(0, ...samples.map((sample) => sample.bytes)),
                    )}{" "}
                    sampled peak
                  </span>
                </div>
                <Sparkline
                  values={samples.map((sample) => sample.bytes)}
                  color="#a6adf0"
                  height={65}
                />
                <div className="chart-foot">
                  <span>Bytes · zero-based scale</span>
                  <span>Independent from managed object counts</span>
                </div>
              </section>
              <section className="panel slot-panel">
                <div className="panel-title">
                  <div>
                    <h3>Heap slot map</h3>
                    <p>
                      Inspect a slot to check its generation and current object.
                    </p>
                  </div>
                  <span className="slot-legend">
                    <i className="slot-occupied" />
                    Occupied
                    <i className="slot-free" />
                    Free
                    <i className="slot-unreachable" />
                    Unreachable
                  </span>
                </div>
                <div className="slot-map" data-testid="slot-map">
                  {heap?.slots.length ? (
                    heap.slots.map((slot) => (
                      <button
                        key={slot.index}
                        className={`slot slot-${slot.state}${slot.state === "occupied" && !slot.reachable ? " slot-unreachable" : ""}${selectedHandle?.index === slot.index && selectedHandle.generation === slot.generation ? " selected" : ""}`}
                        title={`Slot ${slot.index} · generation ${slot.generation} · ${slot.kind ?? slot.state}${slot.reachable ? " · reachable" : ""}`}
                        aria-label={`Inspect slot ${slot.index} generation ${slot.generation}`}
                        onClick={() =>
                          onHandle({
                            index: slot.index,
                            generation: slot.generation,
                          })
                        }
                      >
                        {slot.index}
                      </button>
                    ))
                  ) : (
                    <div className="slot-map-empty">
                      The heap is empty. Run a workflow to allocate real runtime
                      objects.
                    </div>
                  )}
                </div>
                <div className="slot-panel-foot">
                  <span>
                    {heap?.truncated
                      ? `Showing first ${heap.slots.length} slots`
                      : `${heap?.slots.length ?? 0} slots`}
                  </span>
                  <span>
                    {state.heap.retired_slots} retired · Selection adds no root
                  </span>
                </div>
              </section>
              <section className="panel object-table-panel">
                <div className="panel-title">
                  <h3>Live objects</h3>
                  <span>{heap?.objects.length ?? 0} in this snapshot</span>
                </div>
                {heap?.objects.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Handle</th>
                          <th>Object</th>
                          <th>Type</th>
                          <th>Reachability</th>
                          <th>Refs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {heap.objects.slice(0, 60).map((object) => (
                          <tr
                            key={handleId(object.handle)}
                            className={
                              selectedHandle &&
                              handleId(selectedHandle) ===
                                handleId(object.handle)
                                ? "selected"
                                : ""
                            }
                            onClick={() => onHandle(object.handle)}
                          >
                            <td>
                              <button
                                className="handle-link"
                                onClick={() => onHandle(object.handle)}
                              >
                                {handleId(object.handle)}
                              </button>
                            </td>
                            <td>{object.label}</td>
                            <td>
                              <span
                                className="type-dot"
                                style={{
                                  background: objectColors[object.kind],
                                }}
                              />
                              {object.kind}
                            </td>
                            <td>
                              {object.root ? (
                                <Badge tone="completed">root</Badge>
                              ) : object.reachable ? (
                                "Reachable"
                              ) : (
                                <span className="amber-text">Unreachable</span>
                              )}
                            </td>
                            <td>{object.references.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="table-empty">No live objects in the heap.</p>
                )}
              </section>
              <div className="technical-note">
                <Icon name="info" size={16} />
                <p>
                  GC reclaims managed objects and makes slots reusable. WASM
                  linear memory can remain at its high-water mark after
                  collection.
                </p>
              </div>
            </>
          )}
          {tab === "gc" && (
            <>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">MARK & SWEEP</div>
                  <h2>Reclaim what is no longer reachable.</h2>
                  <p>
                    Root tracing, slot reclamation, and measured collection
                    pauses.
                  </p>
                </div>
                <Badge tone={state.auto_gc ? "completed" : "neutral"}>
                  {state.auto_gc
                    ? "Automatic collection on"
                    : "Manual collection"}
                </Badge>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="Collection cycles"
                  value={number(state.gc.cycles)}
                  detail={`Total collector time ${ms(state.gc.cumulative_ms)}`}
                />
                <Metric
                  label="Objects reclaimed"
                  value={number(state.gc.total_reclaimed)}
                  detail="Cumulative since diagnostics reset"
                  accent="#72d8b7"
                />
                <Metric
                  label="Last GC pause"
                  value={state.gc.last ? ms(state.gc.last.pause_ms) : "—"}
                  detail={
                    state.gc.last
                      ? `Last at ${duration(state.gc.last.at_ms)} virtual`
                      : "No collection measured yet"
                  }
                  accent="#d6b875"
                />
                <Metric
                  label="Current roots"
                  value={number(state.roots.length)}
                  detail={`${state.active_runs} active · ${state.pinned_runs} pinned runs`}
                />
              </div>
              <div className="gc-charts">
                <section className="panel">
                  <div className="panel-title">
                    <h3>Collection pause</h3>
                    <span>
                      Milliseconds · last {state.gc.history.length} cycles
                    </span>
                  </div>
                  <Sparkline
                    values={state.gc.history.map((cycle) => cycle.pause_ms)}
                    color="#ddbd7d"
                    height={115}
                  />
                  <div className="chart-foot">
                    <span>Cycle {state.gc.history[0]?.cycle ?? "—"}</span>
                    <span>
                      Peak{" "}
                      {state.gc.history.length
                        ? ms(
                            Math.max(
                              ...state.gc.history.map(
                                (cycle) => cycle.pause_ms,
                              ),
                            ),
                          )
                        : "—"}
                    </span>
                    <span>Cycle {state.gc.history.at(-1)?.cycle ?? "—"}</span>
                  </div>
                </section>
                <section className="panel gc-phases">
                  <div className="panel-title">
                    <h3>Last collection phases</h3>
                    <span>#{state.gc.last?.cycle ?? "—"}</span>
                  </div>
                  <div className="phase-row">
                    <span>
                      <i className="phase-dot mark" />
                      Mark reachable objects
                    </span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.mark_ms) : "—"}
                    </strong>
                  </div>
                  <div className="phase-row">
                    <span>
                      <i className="phase-dot sweep" />
                      Sweep unmarked slots
                    </span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.sweep_ms) : "—"}
                    </strong>
                  </div>
                  <div className="phase-row phase-total">
                    <span>Total stop-the-world pause</span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.pause_ms) : "—"}
                    </strong>
                  </div>
                  <p>
                    Pause includes collector overhead. Mark and sweep durations
                    are measured separately.
                  </p>
                </section>
              </div>
              <section
                className="panel gc-comparison"
                data-testid="gc-comparison"
              >
                <div className="panel-title">
                  <div>
                    <h3>Before & after collection</h3>
                    <p>Captured around your most recent manual collection.</p>
                  </div>
                  <button className="button button-small" onClick={collect}>
                    <Icon name="reset" size={13} />
                    Capture collection
                  </button>
                </div>
                {comparison ? (
                  <>
                    <div className="comparison-flow">
                      <div>
                        <span>BEFORE</span>
                        <strong>
                          {number(comparison.before.stats.live_objects)}
                        </strong>
                        <small>occupied objects</small>
                      </div>
                      <div className="comparison-arrow">
                        <Icon name="arrow" size={24} />
                        <span>
                          {number(comparison.cycle.reclaimed)} reclaimed
                        </span>
                      </div>
                      <div>
                        <span>AFTER</span>
                        <strong>
                          {number(comparison.after.stats.live_objects)}
                        </strong>
                        <small>occupied objects</small>
                      </div>
                      <div className="comparison-detail">
                        <p>
                          <span>Root handles</span>
                          <strong>{comparison.cycle.roots}</strong>
                        </p>
                        <p>
                          <span>Marked reachable</span>
                          <strong>{comparison.cycle.marked}</strong>
                        </p>
                        <p>
                          <span>Slots swept</span>
                          <strong>{comparison.cycle.swept}</strong>
                        </p>
                        <p>
                          <span>Free slots after</span>
                          <strong>{comparison.after.stats.free_slots}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="comparison-slots">
                      {comparison.before.slots.slice(0, 128).map((slot) => {
                        const after = comparison.after.slots.find(
                          (item) => item.index === slot.index,
                        );
                        const reclaimed =
                          slot.state === "occupied" && after?.state === "free";
                        return (
                          <span
                            key={slot.index}
                            title={`Slot ${slot.index}: ${slot.state} → ${after?.state ?? "unavailable"}`}
                            className={`comparison-slot ${reclaimed ? "reclaimed" : after?.state === "occupied" ? "survived" : ""}`}
                          />
                        );
                      })}
                    </div>
                    <div className="comparison-foot">
                      <span>
                        <i
                          className="type-dot"
                          style={{ background: "#e0b876" }}
                        />
                        Reclaimed
                        <i
                          className="type-dot"
                          style={{ background: "#76d7b6" }}
                        />
                        Survived
                      </span>
                      <span>
                        GC {ms(comparison.cycle.pause_ms)} · JS command round
                        trip {ms(comparison.roundTripMs)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="comparison-empty">
                    <Icon name="layers" size={23} />
                    <p>
                      Collect garbage to compare the actual heap before and
                      after a collection.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h3>Collection history</h3>
                  <span>Bounded to 60 cycles</span>
                </div>
                {state.gc.history.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Cycle</th>
                          <th>Virtual time</th>
                          <th>Roots</th>
                          <th>Before</th>
                          <th>Marked</th>
                          <th>Reclaimed</th>
                          <th>Mark</th>
                          <th>Sweep</th>
                          <th>Pause</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...state.gc.history].reverse().map((cycle) => (
                          <tr key={cycle.cycle}>
                            <td>#{cycle.cycle}</td>
                            <td>{duration(cycle.at_ms)}</td>
                            <td>{cycle.roots}</td>
                            <td>{cycle.before}</td>
                            <td>{cycle.marked}</td>
                            <td className="green-text">{cycle.reclaimed}</td>
                            <td>{ms(cycle.mark_ms)}</td>
                            <td>{ms(cycle.sweep_ms)}</td>
                            <td>{ms(cycle.pause_ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="table-empty">
                    No collections yet. Run a workflow and collect to inspect
                    the first cycle.
                  </p>
                )}
              </section>
              <section className="panel root-panel">
                <div className="panel-title">
                  <h3>Root registry</h3>
                  <span>{state.roots.length} handles</span>
                </div>
                {state.roots.length ? (
                  <div className="root-list">
                    {state.roots.slice(0, 40).map((root, index) => (
                      <button
                        key={`${handleId(root.handle)}-${index}`}
                        onClick={() => {
                          onHandle(root.handle);
                          onTab("references");
                        }}
                      >
                        <Icon name="pin" size={13} />
                        <code>{handleId(root.handle)}</code>
                        <span>{root.reason}</span>
                        <Icon name="arrow" size={13} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="table-empty">
                    No roots. Unreachable objects are eligible for the next
                    collection.
                  </p>
                )}
                <p className="root-policy">
                  Active runs, scheduled continuations, pinned runs, and
                  completed runs within the{" "}
                  {duration(state.limits.retention_ms)} retention window are
                  protected.
                </p>
              </section>
            </>
          )}
          {tab === "references" && (
            <>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">STRONG REFERENCES</div>
                  <h2>Follow the life of a run.</h2>
                  <p>
                    Actual Rust objects and their references, including cycles.
                  </p>
                </div>
                <div className="reference-filter">
                  <label htmlFor="reference-run">Scope</label>
                  <select
                    id="reference-run"
                    value={referenceRun ?? "all"}
                    onChange={(event) =>
                      onReferenceRun(
                        event.target.value === "all"
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="all">All live objects</option>
                    {[...state.runs]
                      .sort((a, b) => b.id - a.id)
                      .map((run) => (
                        <option key={run.id} value={run.id}>
                          Run #{run.id} · {run.name}
                          {run.collected ? " (collected)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="reference-legend">
                {["Run", "Task", "Value", "Continuation"].map((kind) => (
                  <span key={kind}>
                    <i
                      className="type-dot"
                      style={{ background: objectColors[kind] }}
                    />
                    {kind}
                  </span>
                ))}
                <span>
                  <Icon name="pin" size={12} />
                  Root
                </span>
                <span className="reference-count">
                  {graph?.objects.length ?? 0} objects{" "}
                  {graph?.truncated && "· limited to 80"}
                </span>
              </div>
              <div className="reference-canvas" data-testid="reference-graph">
                {graph?.objects.length ? (
                  <ReferenceCanvas
                    graph={graph}
                    selected={selectedHandle}
                    onSelect={onHandle}
                  />
                ) : (
                  <Empty
                    icon="workflow"
                    title={
                      referenceRun != null
                        ? "No live graph for this run"
                        : "The object graph is empty"
                    }
                  >
                    {referenceRun != null
                      ? "Its runtime objects may have been collected. A selected stale handle can still be checked in the inspector."
                      : "Run a workflow to explore the references created by the engine."}
                  </Empty>
                )}
              </div>
              <div className="reference-note">
                <Icon name="info" size={15} />
                <span>
                  Task → Run back-references create real runtime cycles. UI
                  selection is a weak handle; it never extends object lifetime.
                </span>
              </div>
            </>
          )}
        </div>
        {tab !== "gc" && (
          <ObjectInspector
            handle={selectedHandle}
            inspection={inspection}
            lastKnown={known}
            onHandle={onHandle}
          />
        )}
      </div>
    </div>
  );
}

function ObjectInspector({
  handle,
  inspection,
  lastKnown,
  onHandle,
}: {
  handle: Handle | null;
  inspection: Inspection | null;
  lastKnown: ObjectView | null;
  onHandle: (handle: Handle) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValue(handle ? handleId(handle) : "");
    setError(null);
  }, [handle]);
  const object = inspection?.valid ? inspection.object : undefined;
  const inspect = () => {
    const match = /^(\d+):(\d+)$/.exec(value.trim());
    if (!match) {
      setError("Use slot:generation, for example 0:1.");
      return;
    }
    const index = Number(match[1]);
    const generation = Number(match[2]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(generation)) {
      setError("Index and generation must be safe non-negative integers.");
      return;
    }
    onHandle({ index, generation });
    setError(null);
  };
  return (
    <aside className="object-inspector" data-testid="handle-inspection">
      <div className="inspector-header">
        <div>
          <Icon name="search" size={16} />
          <strong>Object inspector</strong>
        </div>
        <span className="tiny-tag">WEAK</span>
      </div>
      <div className="object-inspector-body">
        <label className="field-label" htmlFor="handle-input">
          Generational handle
        </label>
        <div className="handle-input">
          <input
            id="handle-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") inspect();
            }}
            placeholder="slot:generation"
            aria-label="Handle to inspect"
          />
          <button
            className="icon-button"
            onClick={inspect}
            aria-label="Inspect handle"
          >
            <Icon name="arrow" size={16} />
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
        {!handle ? (
          <div className="object-placeholder">
            <Icon name="box" size={32} />
            <h3>Select an object</h3>
            <p>
              Choose a slot, a graph node, or enter a handle to inspect the live
              Rust heap.
            </p>
          </div>
        ) : inspection?.valid && object ? (
          <>
            <div className="object-identity">
              <span
                className="object-type"
                style={{ color: objectColors[object.kind] }}
              >
                <Icon
                  name={
                    object.kind === "Run"
                      ? "play"
                      : object.kind === "Task"
                        ? "bolt"
                        : object.kind === "Continuation"
                          ? "clock"
                          : "box"
                  }
                  size={22}
                />
                {object.kind}
              </span>
              <Badge tone="completed">Valid handle</Badge>
              <h3>{object.label}</h3>
            </div>
            <dl className="object-facts">
              <div>
                <dt>Slot index</dt>
                <dd>{object.handle.index}</dd>
              </div>
              <div>
                <dt>Generation</dt>
                <dd>{object.handle.generation}</dd>
              </div>
              <div>
                <dt>Root</dt>
                <dd>{object.root ? "Yes · protected" : "No"}</dd>
              </div>
              <div>
                <dt>Reachable</dt>
                <dd className={object.reachable ? "green-text" : "amber-text"}>
                  {object.reachable ? "Yes" : "No · GC candidate"}
                </dd>
              </div>
              <div>
                <dt>Marked last collection</dt>
                <dd>{object.marked ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <div className="strong-ref-heading">
              STRONG REFERENCES <span>{object.references.length}</span>
            </div>
            <div className="strong-ref-list">
              {object.references.length ? (
                object.references.map((reference, index) => (
                  <button
                    key={`${handleId(reference)}-${index}`}
                    onClick={() => onHandle(reference)}
                  >
                    <Icon name="arrow" size={13} />
                    <code>{handleId(reference)}</code>
                    <Icon name="chevron" size={11} />
                  </button>
                ))
              ) : (
                <p className="field-help">
                  This object has no outgoing references.
                </p>
              )}
            </div>
            {object.payload !== undefined && (
              <JsonBlock title="PAYLOAD" value={object.payload} />
            )}
          </>
        ) : (
          <div className="stale-handle">
            <span className="stale-icon">
              <Icon name="close" size={20} />
            </span>
            <h3>Invalid or stale handle</h3>
            <p>
              {inspection?.error ??
                "This handle no longer resolves to a live object."}
            </p>
            <code>{handleId(handle)}</code>
            <p className="field-help">
              Collection frees the slot. A new allocation uses a different
              generation, so an old handle cannot access its replacement.
            </p>
            {lastKnown && (
              <details>
                <summary>Last observed snapshot</summary>
                <JsonBlock value={lastKnown} />
              </details>
            )}
          </div>
        )}
      </div>
      <div className="object-inspector-foot">
        <Icon name="info" size={14} />
        Inspecting an object does not pin it.
      </div>
    </aside>
  );
}

type ObjectNode = Node<
  { object: ObjectView } & Record<string, unknown>,
  "runtimeObject"
>;
function ObjectNodeCard({ data, selected }: NodeProps<ObjectNode>) {
  const object = data.object;
  return (
    <div
      className={`reference-node ${selected ? "selected" : ""}${!object.reachable ? " unreachable" : ""}`}
      style={{ borderTopColor: objectColors[object.kind] }}
    >
      <FlowHandle type="target" position={Position.Left} />
      <div className="reference-node-top">
        <span style={{ color: objectColors[object.kind] }}>{object.kind}</span>
        {object.root && (
          <span className="root-tag">
            <Icon name="pin" size={10} />
            ROOT
          </span>
        )}
      </div>
      <strong title={object.label}>{object.label}</strong>
      <code>{handleId(object.handle)}</code>
      <FlowHandle type="source" position={Position.Right} />
    </div>
  );
}
const objectNodeTypes = { runtimeObject: ObjectNodeCard };
function ReferenceCanvas({
  graph,
  selected,
  onSelect,
}: {
  graph: ReferenceGraph;
  selected: Handle | null;
  onSelect: (handle: Handle) => void;
}) {
  const nodes = useMemo<ObjectNode[]>(() => {
    const counts: Record<string, number> = {};
    return graph.objects.map((object) => {
      const ordinal = counts[object.kind] ?? 0;
      counts[object.kind] = ordinal + 1;
      return {
        id: handleId(object.handle),
        type: "runtimeObject",
        data: { object },
        selected:
          selected != null && handleId(selected) === handleId(object.handle),
        position: {
          x: { Run: 0, Task: 290, Value: 590, Continuation: 880 }[object.kind],
          y: ordinal * 145 + (object.kind === "Run" ? 45 : 0),
        },
      };
    });
  }, [graph, selected]);
  const edges = useMemo<Edge[]>(() => {
    const present = new Set(
      graph.objects.map((object) => handleId(object.handle)),
    );
    return graph.objects.flatMap((object) =>
      object.references
        .filter((reference) => present.has(handleId(reference)))
        .map((reference, index) => ({
          id: `${handleId(object.handle)}-${handleId(reference)}-${index}`,
          source: handleId(object.handle),
          target: handleId(reference),
          type: "default",
          style: {
            stroke:
              selected && handleId(selected) === handleId(object.handle)
                ? "#77ddbd"
                : "#4a586d",
            strokeWidth:
              selected && handleId(selected) === handleId(object.handle)
                ? 2.2
                : 1.2,
            opacity: 0.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#5e7187",
            width: 14,
            height: 14,
          },
        })),
    );
  }, [graph, selected]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={objectNodeTypes}
      onNodeClick={(_, node) => onSelect(node.data.object.handle)}
      nodesConnectable={false}
      nodesDraggable={false}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.07}
      maxZoom={1.8}
      colorMode="dark"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#34404b"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
