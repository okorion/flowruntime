import { displayLabel, statusLabel, errorText, canvasLabels } from "../labels";
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
      setQueryError(
        errorText(error instanceof Error ? error.message : String(error)),
      );
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
        <div className="dev-tabs" role="tablist" aria-label="개발자 도구 선택">
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
            GC
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
              aria-label="자동 GC"
            />
            <span className="toggle-track" />
            자동 GC
          </label>
          <span className="toolbar-separator" />
          <button
            className="button button-small"
            onClick={() => onCommand({ op: "step", delta_ms: 5000 })}
            title="가상 시간을 5초 진행한 뒤 일시 정지"
          >
            <Icon name="step" size={14} />
            가상 시간 +5초
          </button>
          <button
            className="button button-small button-primary-soft"
            onClick={collect}
          >
            <Icon name="reset" size={14} />
            GC 실행
          </button>
        </div>
      </div>
      {queryError && (
        <div className="notice notice-error" role="alert">
          {errorText(queryError)}
        </div>
      )}
      <div className={`dev-content ${tab === "gc" ? "dev-content-wide" : ""}`}>
        <div className="dev-main">
          {tab === "heap" && (
            <>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">Heap · 객체 저장소</div>
                  <h2>지금 어떤 객체가 남아 있나요?</h2>
                  <p>
                    점유 슬롯은 남아 있는 객체 수입니다. 빈 슬롯은 다음 실행에서
                    재사용합니다.
                  </p>
                </div>
                <Badge tone="completed">실제 엔진 상태</Badge>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="점유 슬롯"
                  value={
                    <span data-testid="live-objects">
                      {number(state.heap.live_objects)}
                    </span>
                  }
                  detail={`전체 ${number(state.heap.capacity)}개 · 보존 ${state.retained_runs} / Pin ${state.pinned_runs} Run`}
                  accent="#72d8b7"
                />
                <Metric
                  label="빈 슬롯"
                  value={number(state.heap.free_slots)}
                  detail="새 객체에 재사용 가능"
                />
                <Metric
                  label="슬롯 재사용 횟수"
                  value={number(state.heap.reused_slots)}
                  detail={`관리 객체 누적 할당 ${number(state.heap.allocations)}회`}
                />
                <Metric
                  label="WASM 선형 메모리"
                  value={bytes(memoryBytes)}
                  detail="실제 할당된 메모리 크기"
                  accent="#a8b0f4"
                />
              </div>
              <div className="heap-charts">
                <section className="panel">
                  <div className="panel-title">
                    <h3>객체 수 변화</h3>
                    <span className="chart-legend">
                      <i />
                      점유
                      <i className="capacity" />
                      전체 슬롯
                      <i className="free" />
                      비어 있음
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
                    <span>최근 {samples.length}개 측정 · 가상 시간</span>
                    <span>{duration(state.now_ms)}</span>
                  </div>
                  <p className="chart-note">
                    공통 눈금: 0–
                    {number(
                      Math.max(1, ...samples.map((sample) => sample.capacity)),
                    )}{" "}
                    슬롯 · 1초마다 측정
                  </p>
                </section>
                <section className="panel allocation-panel">
                  <div className="panel-title">
                    <h3>유형별 객체 수</h3>
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
                  <h3>WASM 선형 메모리</h3>
                  <span>
                    현재 {bytes(memoryBytes)} ·{" "}
                    {bytes(
                      Math.max(0, ...samples.map((sample) => sample.bytes)),
                    )}{" "}
                    측정 중 최대
                  </span>
                </div>
                <Sparkline
                  values={samples.map((sample) => sample.bytes)}
                  color="#a6adf0"
                  height={65}
                />
                <div className="chart-foot">
                  <span>단위 bytes · 0부터 표시</span>
                  <span>관리 객체 수와 별도로 측정</span>
                </div>
              </section>
              <section className="panel slot-panel">
                <div className="panel-title">
                  <div>
                    <h3>Heap 슬롯 보기</h3>
                    <p>
                      슬롯을 누르면 현재 객체와 Generation을 확인할 수 있습니다.
                    </p>
                  </div>
                  <span className="slot-legend">
                    <i className="slot-occupied" />
                    점유
                    <i className="slot-free" />
                    비어 있음
                    <i className="slot-unreachable" />
                    회수 대상
                  </span>
                </div>
                <div className="slot-map" data-testid="slot-map">
                  {heap?.slots.length ? (
                    heap.slots.map((slot) => (
                      <button
                        key={slot.index}
                        className={`slot slot-${slot.state}${slot.state === "occupied" && !slot.reachable ? " slot-unreachable" : ""}${selectedHandle?.index === slot.index && selectedHandle.generation === slot.generation ? " selected" : ""}`}
                        title={`Slot ${slot.index} · generation ${slot.generation} · ${slot.kind ?? slot.state}${slot.reachable ? " · reachable" : ""}`}
                        aria-label={`슬롯 ${slot.index} 세대 ${slot.generation} 조회`}
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
                      Heap이 비어 있습니다. Workflow를 실행하면 실제 객체가
                      생성됩니다.
                    </div>
                  )}
                </div>
                <div className="slot-panel-foot">
                  <span>
                    {heap?.truncated
                      ? `처음 ${heap.slots.length}개 슬롯 표시`
                      : `슬롯 ${heap?.slots.length ?? 0}개`}
                  </span>
                  <span>
                    재사용 중단 {state.heap.retired_slots}개 · 선택만으로
                    보존되지 않음
                  </span>
                </div>
              </section>
              <section className="panel object-table-panel">
                <div className="panel-title">
                  <h3>남아 있는 객체</h3>
                  <span>현재 스냅샷 {heap?.objects.length ?? 0}개</span>
                </div>
                {heap?.objects.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Handle</th>
                          <th>객체</th>
                          <th>유형</th>
                          <th>보존 여부</th>
                          <th>참조 수</th>
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
                            <td>{displayLabel(object.label)}</td>
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
                                "Root에서 도달 가능"
                              ) : (
                                <span className="amber-text">회수 대상</span>
                              )}
                            </td>
                            <td>{object.references.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="table-empty">
                    Heap에 남아 있는 객체가 없습니다.
                  </p>
                )}
              </section>
              <div className="technical-note">
                <Icon name="info" size={16} />
                <p>
                  GC는 객체를 회수하고 슬롯을 재사용 가능하게 만듭니다. WASM
                  메모리 크기는 회수 후에도 그대로일 수 있습니다.
                </p>
              </div>
            </>
          )}
          {tab === "gc" && (
            <>
              <details className="gc-guide">
                <summary>객체 회수를 직접 확인하는 방법</summary>
                <ol>
                  <li>
                    자동 GC를 끄고, Workflow 편집 화면에서 주문 분류를 한 번
                    실행합니다.
                  </li>
                  <li>
                    이 화면으로 돌아와 가상 시간 +5초를 두 번 누릅니다. 완료
                    객체의 보존 기간을 넘깁니다.
                  </li>
                  <li>
                    GC 실행을 누르고 아래 전후 비교에서 점유 객체 수가 줄었는지
                    확인합니다.
                  </li>
                </ol>
                <p>
                  Pin한 Run과 아직 실행 중인 객체는 유지됩니다. Pin은 실행 결과
                  화면에서 해제할 수 있습니다.
                </p>
              </details>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">GC · 사용하지 않는 객체 회수</div>
                  <h2>GC 전후에 무엇이 달라졌나요?</h2>
                  <p>
                    Root에서 연결이 끊긴 객체를 회수합니다. 수집 전후의 객체
                    수와 실제 정지 시간을 비교하세요.
                  </p>
                </div>
                <Badge tone={state.auto_gc ? "completed" : "neutral"}>
                  {state.auto_gc ? "자동 GC 켜짐" : "수동 GC 모드"}
                </Badge>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="GC 실행 횟수"
                  value={number(state.gc.cycles)}
                  detail={`누적 GC 시간 ${ms(state.gc.cumulative_ms)}`}
                />
                <Metric
                  label="회수한 객체"
                  value={number(state.gc.total_reclaimed)}
                  detail="진단 초기화 이후 누적"
                  accent="#72d8b7"
                />
                <Metric
                  label="최근 GC 정지 시간"
                  value={state.gc.last ? ms(state.gc.last.pause_ms) : "—"}
                  detail={
                    state.gc.last
                      ? `가상 시간 ${duration(state.gc.last.at_ms)}에 실행`
                      : "아직 GC 측정 없음"
                  }
                  accent="#d6b875"
                />
                <Metric
                  label="현재 Root 수"
                  value={number(state.roots.length)}
                  detail={`실행 중 ${state.active_runs}개 · Pin ${state.pinned_runs}개`}
                />
              </div>
              <div className="gc-charts">
                <section className="panel">
                  <div className="panel-title">
                    <h3>GC 정지 시간 변화</h3>
                    <span>단위 ms · 최근 {state.gc.history.length}회</span>
                  </div>
                  <Sparkline
                    values={state.gc.history.map((cycle) => cycle.pause_ms)}
                    color="#ddbd7d"
                    height={115}
                  />
                  <div className="chart-foot">
                    <span>회차 {state.gc.history[0]?.cycle ?? "—"}</span>
                    <span>
                      최대{" "}
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
                    <h3>최근 GC 단계별 시간</h3>
                    <span>#{state.gc.last?.cycle ?? "—"}</span>
                  </div>
                  <div className="phase-row">
                    <span>
                      <i className="phase-dot mark" />
                      Mark · 연결된 객체 표시
                    </span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.mark_ms) : "—"}
                    </strong>
                  </div>
                  <div className="phase-row">
                    <span>
                      <i className="phase-dot sweep" />
                      Sweep · 표시되지 않은 객체 회수
                    </span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.sweep_ms) : "—"}
                    </strong>
                  </div>
                  <div className="phase-row phase-total">
                    <span>전체 Stop-the-World 시간</span>
                    <strong>
                      {state.gc.last ? ms(state.gc.last.pause_ms) : "—"}
                    </strong>
                  </div>
                  <p>
                    전체 시간에는 GC 준비 과정도 포함됩니다. Mark와 Sweep 시간은
                    각각 측정합니다.
                  </p>
                </section>
              </div>
              <section
                className="panel gc-comparison"
                data-testid="gc-comparison"
              >
                <div className="panel-title">
                  <div>
                    <h3>GC 실행 전후 비교</h3>
                    <p>가장 최근에 수동 GC를 실행한 직전·직후 상태입니다.</p>
                  </div>
                  <button className="button button-small" onClick={collect}>
                    <Icon name="reset" size={13} />
                    GC 실행하고 비교
                  </button>
                </div>
                {comparison ? (
                  <>
                    <div className="comparison-flow">
                      <div>
                        <span>실행 전</span>
                        <strong>
                          {number(comparison.before.stats.live_objects)}
                        </strong>
                        <small>점유 객체</small>
                      </div>
                      <div className="comparison-arrow">
                        <Icon name="arrow" size={24} />
                        <span>{number(comparison.cycle.reclaimed)}개 회수</span>
                      </div>
                      <div>
                        <span>실행 후</span>
                        <strong>
                          {number(comparison.after.stats.live_objects)}
                        </strong>
                        <small>점유 객체</small>
                      </div>
                      <div className="comparison-detail">
                        <p>
                          <span>Root Handle 수</span>
                          <strong>{comparison.cycle.roots}</strong>
                        </p>
                        <p>
                          <span>Mark한 객체</span>
                          <strong>{comparison.cycle.marked}</strong>
                        </p>
                        <p>
                          <span>Sweep에서 검사한 슬롯</span>
                          <strong>{comparison.cycle.swept}</strong>
                        </p>
                        <p>
                          <span>실행 후 빈 슬롯</span>
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
                        회수됨
                        <i
                          className="type-dot"
                          style={{ background: "#76d7b6" }}
                        />
                        유지됨
                      </span>
                      <span>
                        GC {ms(comparison.cycle.pause_ms)} · JS 명령 왕복{" "}
                        {ms(comparison.roundTripMs)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="comparison-empty">
                    <Icon name="layers" size={23} />
                    <p>
                      GC 실행을 누르면 실제 Heap의 변화가 여기에 표시됩니다.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h3>GC 실행 기록</h3>
                  <span>최근 60회 보관</span>
                </div>
                {state.gc.history.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>회차</th>
                          <th>가상 시간</th>
                          <th>Roots</th>
                          <th>실행 전</th>
                          <th>Marked</th>
                          <th>회수됨</th>
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
                    아직 GC 기록이 없습니다. Workflow를 실행한 뒤 GC를 실행해
                    보세요.
                  </p>
                )}
              </section>
              <section className="panel root-panel">
                <div className="panel-title">
                  <h3>Root 목록 · 객체 보존의 시작점</h3>
                  <span>Handle {state.roots.length}개</span>
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
                        <span>{statusLabel(root.reason)}</span>
                        <Icon name="arrow" size={13} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="table-empty">
                    Root가 없습니다. 연결이 끊긴 객체는 다음 GC에서 회수됩니다.
                  </p>
                )}
                <p className="root-policy">
                  실행 중인 Run, 대기 중인 Continuation, Pin한 Run과 완료 후{" "}
                  {duration(state.limits.retention_ms)} 이내의 Run을 보존합니다.
                </p>
              </section>
            </>
          )}
          {tab === "references" && (
            <>
              <div className="dev-page-heading">
                <div>
                  <div className="eyebrow">강한 참조</div>
                  <h2>객체는 어떻게 연결되어 있나요?</h2>
                  <p>
                    실제 Run·Task·Value의 참조 관계입니다. 화살표를 따라가면
                    순환 참조도 확인할 수 있습니다.
                  </p>
                </div>
                <div className="reference-filter">
                  <label htmlFor="reference-run">표시 범위</label>
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
                    <option value="all">남아 있는 모든 객체</option>
                    {[...state.runs]
                      .sort((a, b) => b.id - a.id)
                      .map((run) => (
                        <option key={run.id} value={run.id}>
                          Run #{run.id} · {displayLabel(run.name)}
                          {run.collected ? " (회수됨)" : ""}
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
                  객체 {graph?.objects.length ?? 0}개{" "}
                  {graph?.truncated && "· 최대 80개 표시"}
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
                        ? "이 Run의 객체가 남아 있지 않습니다"
                        : "객체 그래프가 비어 있습니다"
                    }
                  >
                    {referenceRun != null
                      ? "객체가 이미 회수됐을 수 있습니다. 선택한 Handle의 유효성은 오른쪽에서 확인할 수 있습니다."
                      : "Workflow를 실행하면 엔진이 생성한 참조 관계를 볼 수 있습니다."}
                  </Empty>
                )}
              </div>
              <div className="reference-note">
                <Icon name="info" size={15} />
                <span>
                  Run → Task → Run이 순환 참조를 만듭니다. 화면에서 선택하는
                  것만으로 객체가 보존되지는 않습니다.
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
      setError("slot:generation 형식으로 입력하세요. 예: 0:1");
      return;
    }
    const index = Number(match[1]);
    const generation = Number(match[2]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(generation)) {
      setError("Index와 Generation은 안전한 범위의 0 이상 정수여야 합니다.");
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
          <strong>객체 상세</strong>
        </div>
        <span className="tiny-tag">WEAK</span>
      </div>
      <div className="object-inspector-body">
        <label className="field-label" htmlFor="handle-input">
          Handle · 슬롯:세대
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
            aria-label="조회할 Handle"
          />
          <button
            className="icon-button"
            onClick={inspect}
            aria-label="Handle 조회"
          >
            <Icon name="arrow" size={16} />
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
        {!handle ? (
          <div className="object-placeholder">
            <Icon name="box" size={32} />
            <h3>객체를 선택하세요</h3>
            <p>
              슬롯이나 그래프의 객체를 누르세요. Handle을 직접 입력해 조회할
              수도 있습니다.
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
              <Badge tone="completed">유효한 Handle</Badge>
              <h3>{displayLabel(object.label)}</h3>
            </div>
            <dl className="object-facts">
              <div>
                <dt>슬롯 번호</dt>
                <dd>{object.handle.index}</dd>
              </div>
              <div>
                <dt>Generation · 세대</dt>
                <dd>{object.handle.generation}</dd>
              </div>
              <div>
                <dt>Root</dt>
                <dd>{object.root ? "예 · 보존됨" : "아니요"}</dd>
              </div>
              <div>
                <dt>Root에서 도달 가능</dt>
                <dd className={object.reachable ? "green-text" : "amber-text"}>
                  {object.reachable ? "예" : "아니요 · GC 회수 대상"}
                </dd>
              </div>
              <div>
                <dt>최근 GC의 Mark 여부</dt>
                <dd>{object.marked ? "예" : "아니요"}</dd>
              </div>
            </dl>
            <div className="strong-ref-heading">
              강한 참조 <span>{object.references.length}</span>
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
                  이 객체가 참조하는 다른 객체는 없습니다.
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
            <h3>유효하지 않거나 회수된 Handle</h3>
            <p>
              {inspection?.error
                ? errorText(inspection.error)
                : "이 Handle에 해당하는 객체가 남아 있지 않습니다."}
            </p>
            <code>{handleId(handle)}</code>
            <p className="field-help">
              회수한 슬롯을 재사용할 때는 Generation이 달라집니다. 이전 Handle로
              새 객체에 접근할 수 없습니다.
            </p>
            {lastKnown && (
              <details>
                <summary>마지막으로 관찰한 상태</summary>
                <JsonBlock value={lastKnown} />
              </details>
            )}
          </div>
        )}
      </div>
      <div className="object-inspector-foot">
        <Icon name="info" size={14} />
        조회만으로 객체가 보존되지는 않습니다.
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
      <strong title={displayLabel(object.label)}>
        {displayLabel(object.label)}
      </strong>
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
      ariaLabelConfig={canvasLabels}
      nodes={nodes}
      edges={edges}
      nodeTypes={objectNodeTypes}
      onNodeClick={(_, node) => onSelect(node.data.object.handle)}
      nodesConnectable={false}
      nodesDraggable={false}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.15, minZoom: 0.85, maxZoom: 1 }}
      minZoom={0.25}
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
