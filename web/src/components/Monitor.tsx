import { displayLabel, statusLabel, errorText } from "../labels";
import { useEffect, useState } from "react";
import type { EngineClient } from "../engine";
import type {
  EngineState,
  Handle,
  RunDetail,
  RunSummary,
  TaskView,
} from "../types";
import {
  Badge,
  duration,
  Empty,
  handleId,
  Icon,
  JsonBlock,
  number,
} from "./ui";
import { WorkflowCanvas } from "./Studio";

interface MonitorProps {
  engine: EngineClient;
  state: EngineState;
  selectedRun: number | null;
  onSelect: (id: number) => void;
  onTrace: (handle: Handle, runId: number) => void;
  onCommand: (command: Record<string, unknown>) => void;
  onRun: () => void;
}

export function Monitor({
  engine,
  state,
  selectedRun,
  onSelect,
  onTrace,
  onCommand,
  onRun,
}: MonitorProps) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "workflow">("timeline");
  const [filter, setFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  useEffect(() => {
    if (selectedRun == null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    try {
      setDetail(engine.request<RunDetail>({ op: "run", run_id: selectedRun }));
      setDetailError(null);
    } catch (error) {
      setDetail(null);
      setDetailError(
        errorText(error instanceof Error ? error.message : String(error)),
      );
    }
  }, [engine, selectedRun, state]);
  useEffect(() => {
    setSelectedTask(null);
  }, [selectedRun]);
  const runs = [...state.runs]
    .sort((a, b) => b.id - a.id)
    .filter((run) => filter === "all" || run.status === filter);
  const task = detail?.tasks.find((item) => item.node_id === selectedTask);
  return (
    <div className="monitor-layout">
      <aside className="run-list-panel">
        <div className="run-list-heading">
          <div>
            <h2>실행 목록</h2>
            <span>최근 Run {number(state.runs.length)}개</span>
          </div>
          <Icon name="activity" size={20} />
        </div>
        <div className="run-filter">
          <label className="sr-only" htmlFor="run-status-filter">
            Run 상태 필터
          </label>
          <select
            id="run-status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">모든 상태</option>
            <option value="running">실행 중</option>
            <option value="waiting">대기 중</option>
            <option value="completed">완료</option>
            <option value="failed">실패</option>
            <option value="cancelled">취소</option>
          </select>
          <span>{runs.length}</span>
        </div>
        <div className="run-list">
          {runs.length ? (
            runs.map((run) => (
              <RunListItem
                key={run.id}
                run={run}
                selected={selectedRun === run.id}
                onSelect={() => onSelect(run.id)}
              />
            ))
          ) : (
            <div className="run-list-empty">
              {filter === "all"
                ? "실행하면 Run 목록이 여기에 나타납니다."
                : "이 상태의 Run이 없습니다."}
            </div>
          )}
        </div>
        <div className="run-list-footer">
          <Icon name="info" size={13} />
          완료 기록은 최근 {state.limits.history_limit}개·JSON 8 MiB 한도 내에서 보관합니다.
        </div>
      </aside>
      <section className="execution-detail">
        {!detail ? (
          <Empty
            icon="activity"
            title={
              detailError
                ? "실행 상세를 불러올 수 없습니다"
                : "첫 실행을 시작해 보세요"
            }
            action={
              <button className="button button-primary" onClick={onRun}>
                <Icon name="play" size={15} />
                실행하기
              </button>
            }
          >
            {detailError ??
              "실행하기를 누르면 Task의 처리 순서와 결과가 표시됩니다."}
          </Empty>
        ) : (
          <>
            <div className="execution-heading">
              <div>
                <div className="eyebrow">선택한 Run</div>
                <h2>
                  {displayLabel(detail.name)}{" "}
                  <span>#{String(detail.id).padStart(4, "0")}</span>
                </h2>
                <div className="execution-subline">
                  <Badge tone={statusLabel(detail.status)}>
                    {statusLabel(detail.status)}
                  </Badge>
                  <span>
                    {duration(
                      (detail.completed_at ?? state.now_ms) - detail.started_at,
                    )}
                  </span>
                  <span className="dot-separator">·</span>
                  <span>Task {detail.tasks.length}개</span>
                </div>
              </div>
              <div className="execution-actions">
                <button
                  className={`button button-small ${detail.pinned ? "button-pinned" : ""}`}
                  disabled={detail.collected}
                  onClick={() =>
                    onCommand({
                      op: "pin",
                      run_id: detail.id,
                      pinned: !detail.pinned,
                    })
                  }
                  aria-label={
                    detail.pinned ? "Run 보존 해제" : "Run 보존 (Pin)"
                  }
                >
                  <Icon name="pin" size={14} />
                  {detail.pinned ? "보존 중 (Pin)" : "Run 보존 (Pin)"}
                </button>
                <button
                  className="button button-small"
                  disabled={detail.collected}
                  onClick={() => onTrace(detail.handle, detail.id)}
                >
                  <Icon name="search" size={14} />
                  객체 참조 보기
                </button>
                {(detail.status === "running" ||
                  detail.status === "waiting") && (
                  <button
                    className="button button-small danger-hover"
                    onClick={() =>
                      onCommand({ op: "cancel", run_id: detail.id })
                    }
                  >
                    <Icon name="stop" size={14} />
                    Run 취소
                  </button>
                )}
              </div>
            </div>
            {detail.collected && (
              <p className="waiting-note" data-testid="archived-run-notice">
                실행 객체는 GC로 회수되었습니다. 아래 결과와 처리 순서는 완료 시 저장한 기록입니다.
              </p>
            )}
            <details className="run-metadata">
              <summary>실행 상세 · 시작 시각과 보존 상태</summary>
              <div className="execution-metadata">
                <div>
                  <span>시작 시각</span>
                  <strong>
                    {duration(detail.started_at)} <small>가상 시간</small>
                  </strong>
                </div>
                <div>
                  <span>Run Handle</span>
                  <code>{handleId(detail.handle)}</code>
                </div>
                <div>
                  <span>객체 보존 상태</span>
                  <strong>
                    {detail.pinned
                      ? "Pin으로 보존"
                      : detail.collected
                        ? "회수됨"
                        : detail.retained
                          ? "보존 기간 내"
                          : "Root에서 해제됨"}
                  </strong>
                </div>
                <div>
                  <span>시작 시점의 Workflow</span>
                  <strong>
                    노드 {detail.workflow.nodes.length}개 · Edge{" "}
                    {detail.workflow.edges.length}개
                  </strong>
                </div>
              </div>
            </details>
            {detail.error && (
              <div className="execution-error" role="alert">
                <Icon name="info" size={18} />
                <div>
                  <strong>실행 실패</strong>
                  <p>{errorText(detail.error)}</p>
                </div>
              </div>
            )}
            <div className="detail-tabs">
              <button
                className={view === "timeline" ? "active" : ""}
                onClick={() => setView("timeline")}
              >
                <Icon name="activity" size={15} />
                Task 처리 순서
              </button>
              <button
                className={view === "workflow" ? "active" : ""}
                onClick={() => setView("workflow")}
              >
                <Icon name="workflow" size={15} />
                실행한 Workflow
              </button>
            </div>
            {view === "workflow" ? (
              <div className="snapshot-view">
                <div className="snapshot-note">
                  <Icon name="info" size={14} />이 Run이 시작될 때의 정의입니다.
                  이후 편집은 새 Run부터 적용됩니다.
                </div>
                <div className="snapshot-canvas">
                  <WorkflowCanvas
                    workflow={detail.workflow}
                    readOnly
                    statuses={Object.fromEntries(
                      detail.tasks.map((item) => [item.node_id, item.status]),
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="execution-content">
                <section className="timeline-panel">
                  <div className="panel-title">
                    <h3>Task 처리 순서</h3>
                    <span>가상 시간 기준</span>
                  </div>
                  <div className="timeline" data-testid="task-timeline">
                    {detail.tasks.map((item, index) => (
                      <TaskRow
                        key={`${index}-${item.node_id}`}
                        task={item}
                        index={index}
                        now={state.now_ms}
                        runStart={detail.started_at}
                        selected={selectedTask === item.node_id}
                        collected={detail.collected}
                        onSelect={() => setSelectedTask(item.node_id)}
                        onTrace={() => onTrace(item.handle, detail.id)}
                      />
                    ))}
                  </div>
                  {detail.status === "waiting" && (
                    <div className="waiting-note">
                      <Icon name="clock" size={17} />
                      <span>
                        Continuation이 스케줄러에서 대기 중입니다.{" "}
                        {state.paused
                          ? "계속 실행하거나 Step으로 시간을 진행하세요."
                          : "Delay가 끝나면 다음 Task로 진행합니다."}
                      </span>
                    </div>
                  )}
                </section>
                <aside className="result-panel">
                  {task ? (
                    <>
                      <div className="panel-title">
                        <h3>{displayLabel(task.label)}</h3>
                        <button
                          className="icon-button"
                          aria-label="Run 결과 보기"
                          onClick={() => setSelectedTask(null)}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                      <Badge tone={statusLabel(task.status)}>
                        {statusLabel(task.status)}
                      </Badge>
                      <div className="task-handle">
                        Task Handle <code>{handleId(task.handle)}</code>
                      </div>
                      <JsonBlock title="Task 입력" value={task.input} />
                      <JsonBlock title="Task 출력" value={task.output} />
                      {task.error && (
                        <p className="field-error">{errorText(task.error)}</p>
                      )}
                      <button
                        className="button button-small"
                        disabled={detail.collected}
                        onClick={() => onTrace(task.handle, detail.id)}
                      >
                        <Icon name="search" size={14} />
                        선택한 Task 참조 보기
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="panel-title">
                        <h3>최종 결과</h3>
                        <span className="code-tag">JSON</span>
                      </div>
                      <div data-testid="run-result">
                        <JsonBlock value={detail.result} />
                      </div>
                      {detail.result === null && (
                        <p className="field-help">
                          {detail.status === "failed"
                            ? "결과를 만들기 전에 실행이 중단됐습니다."
                            : detail.status === "cancelled"
                              ? "취소된 실행입니다."
                              : "Run이 완료되면 최종 결과가 표시됩니다."}
                        </p>
                      )}
                      <div className="result-footnote">
                        <Icon name="check" size={14} />
                        <span>Rust/WASM 엔진이 생성한 결과</span>
                      </div>
                      <div className="run-inspection-help">
                        <Icon name="layers" size={19} />
                        <h4>내부 객체가 궁금하다면</h4>
                        <p>
                          개발자 도구에서 이 Run의 Task·Value와 참조 관계를 볼
                          수 있습니다.
                        </p>
                        <button
                          className="text-button"
                          disabled={detail.collected}
                          onClick={() => onTrace(detail.handle, detail.id)}
                        >
                          참조 관계 보기
                          <Icon name="arrow" size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: RunSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`run-item ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-label={`Run #${run.id}`}
    >
      <div className="run-item-top">
        <span className={`run-status-icon status-${statusLabel(run.status)}`}>
          <Icon
            name={
              run.status === "completed"
                ? "check"
                : run.status === "waiting"
                  ? "clock"
                  : run.status === "failed"
                    ? "close"
                    : run.status === "cancelled"
                      ? "stop"
                      : "activity"
            }
            size={14}
          />
        </span>
        <strong>{displayLabel(run.name)}</strong>
        {run.pinned && <Icon name="pin" size={12} />}
        <span className="run-id">#{String(run.id).padStart(4, "0")}</span>
      </div>
      <div className="run-item-bottom">
        <span>{statusLabel(run.status)}</span>
        <span>
          {duration(run.started_at)} <span className="dot-separator">·</span>
          Task {run.task_count}개
        </span>
      </div>
    </button>
  );
}

function TaskRow({
  task,
  index,
  now,
  runStart,
  selected,
  onSelect,
  onTrace,
  collected,
}: {
  task: TaskView;
  index: number;
  now: number;
  runStart: number;
  selected: boolean;
  onSelect: () => void;
  onTrace: () => void;
  collected: boolean;
}) {
  return (
    <div className={`timeline-row ${selected ? "selected" : ""}`}>
      <div className="timeline-track">
        <span className={`timeline-dot status-${statusLabel(task.status)}`}>
          <Icon
            name={
              task.status === "completed"
                ? "check"
                : task.status === "waiting"
                  ? "clock"
                  : task.status === "failed"
                    ? "close"
                    : "activity"
            }
            size={13}
          />
        </span>
        <span className="timeline-line" />
      </div>
      <button className="timeline-task" onClick={onSelect}>
        <div className="timeline-task-top">
          <strong>{displayLabel(task.label)}</strong>
          <span>{duration((task.completed_at ?? now) - task.started_at)}</span>
        </div>
        <div className="timeline-task-bottom">
          <span>
            {String(index + 1).padStart(2, "0")}{" "}
            <span className="dot-separator">·</span>
            {task.kind}
          </span>
          <span className={`status-text status-${statusLabel(task.status)}`}>
            {statusLabel(task.status)}
          </span>
        </div>
        <div className="timeline-time">
          +{duration(task.started_at - runStart)}
          {task.completed_at != null
            ? ` → +${duration(task.completed_at - runStart)}`
            : " → 대기 중"}
        </div>
        {task.error && <p className="field-error">{errorText(task.error)}</p>}
      </button>
      <button
        className="icon-button timeline-trace"
        aria-label={`${displayLabel(task.label)} Task 참조 보기`}
        title="Task 객체 참조 보기"
        disabled={collected}
        onClick={onTrace}
      >
        <Icon name="search" size={14} />
      </button>
    </div>
  );
}
