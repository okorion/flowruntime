import { displayLabel, errorText } from "./labels";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";
import "./styles/readability.css";
import { createEngine, type EngineClient } from "./engine";
import { templates } from "./templates";
import type {
  EngineState,
  Handle,
  RunSummary,
  Validation,
  Workflow,
} from "./types";
import { Studio } from "./components/Studio";
import { Monitor } from "./components/Monitor";
import {
  DeveloperTools,
  type DeveloperTab,
  type MemorySample,
} from "./components/DeveloperTools";
import { Badge, bytes, duration, Icon, json, number } from "./components/ui";

type Page = "studio" | "monitor" | "developer";
const STORAGE_KEY = "flowruntime.workspace.v1";
const nodeKinds = new Set([
  "trigger",
  "transform",
  "condition",
  "delay",
  "output",
]);
function safeWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false;
  const workflow = value as Workflow;
  return (
    typeof workflow.id === "string" &&
    typeof workflow.name === "string" &&
    Array.isArray(workflow.nodes) &&
    workflow.nodes.length <= 64 &&
    Array.isArray(workflow.edges) &&
    workflow.edges.length <= 128 &&
    workflow.nodes.every(
      (node) =>
        node &&
        typeof node.id === "string" &&
        typeof node.label === "string" &&
        nodeKinds.has(node.kind) &&
        node.config != null &&
        typeof node.config === "object" &&
        !Array.isArray(node.config) &&
        node.position &&
        Number.isFinite(node.position.x) &&
        Number.isFinite(node.position.y),
    ) &&
    workflow.edges.every(
      (edge) =>
        edge &&
        typeof edge.id === "string" &&
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        (edge.branch === undefined ||
          edge.branch === "true" ||
          edge.branch === "false"),
    )
  );
}
function readDraft(): { workflow: Workflow; input: string; restored: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length < 1024 * 1024) {
      const draft = JSON.parse(raw) as { workflow?: unknown; input?: unknown };
      if (safeWorkflow(draft.workflow) && typeof draft.input === "string")
        return { workflow: draft.workflow, input: draft.input, restored: true };
    }
  } catch {
    /* A blocked or malformed local store falls back to the default template. */
  }
  return {
    workflow: structuredClone(templates[0].workflow),
    input: json(templates[0].input),
    restored: false,
  };
}
function parseInput(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("입력 데이터는 JSON 객체여야 합니다.");
  return parsed as Record<string, unknown>;
}
const message = (error: unknown) =>
  errorText(error instanceof Error ? error.message : String(error));

export default function App() {
  const [draft] = useState(readDraft);
  const [workflow, setWorkflow] = useState(draft.workflow);
  const [input, setInput] = useState(draft.input);
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [memoryBytes, setMemoryBytes] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("studio");
  const [developerTab, setDeveloperTab] = useState<DeveloperTab>("heap");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<Handle | null>(null);
  const [referenceRun, setReferenceRun] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [revision, setRevision] = useState(0);
  const [diagnosticsEpoch, setDiagnosticsEpoch] = useState(0);
  const [samples, setSamples] = useState<MemorySample[]>([]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState(
    draft.restored ? "저장한 편집 내용 복원됨" : "브라우저에 저장됨",
  );
  const speedRef = useRef(1);
  const continuousRef = useRef({
    enabled: false,
    elapsed: 0,
    input: {} as Record<string, unknown>,
    workflow: draft.workflow,
  });
  const pausedRef = useRef(false);
  const engineRef = useRef<EngineClient | null>(null);
  let inputError: string | null = null;
  try {
    parseInput(input);
  } catch (error) {
    inputError = message(error);
  }

  const reportError = useCallback(
    (text: string) => setNotice({ text, error: true }),
    [],
  );
  const refresh = useCallback(() => {
    const client = engineRef.current;
    if (!client) return;
    const snapshot = client.state();
    setState(snapshot);
    pausedRef.current = snapshot.paused;
    setMemoryBytes(client.memoryBytes());
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    let client: EngineClient | undefined;
    createEngine()
      .then((value) => {
        client = value;
        if (!alive) {
          value.dispose();
          return;
        }
        engineRef.current = value;
        setEngine(value);
        const initial = value.state();
        setState(initial);
        pausedRef.current = initial.paused;
        setMemoryBytes(value.memoryBytes());
        setSamples([
          {
            now: initial.now_ms,
            live: initial.heap.live_objects,
            free: initial.heap.free_slots,
            capacity: initial.heap.capacity,
            bytes: value.memoryBytes(),
          },
        ]);
      })
      .catch((error) => {
        if (alive) setLoadingError(message(error));
      });
    return () => {
      alive = false;
      if (engineRef.current === client) engineRef.current = null;
      client?.dispose();
    };
  }, []);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    setSaveStatus("저장 중…");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflow, input }));
        setSaveStatus("브라우저에 저장됨");
      } catch {
        setSaveStatus("브라우저 저장 불가");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workflow, input]);
  useEffect(() => {
    if (!engine) return;
    const timer = window.setTimeout(() => {
      try {
        setValidation(engine.request<Validation>({ op: "validate", workflow }));
      } catch (error) {
        setValidation({ valid: false, errors: [message(error)] });
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [engine, workflow]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!engine) return;
    let pollCount = 0;
    const tick = window.setInterval(() => {
      if (pausedRef.current) return;
      try {
        const delta = 50 * speedRef.current;
        engine.request({ op: "tick", delta_ms: delta });
        if (continuousRef.current.enabled) {
          continuousRef.current.elapsed += delta;
          if (continuousRef.current.elapsed >= 1000) {
            continuousRef.current.elapsed -= 1000;
            engine.request({
              op: "load",
              workflow: continuousRef.current.workflow,
            });
            const run = engine.request<RunSummary>({
              op: "start",
              input: continuousRef.current.input,
            });
            setSelectedRun(run.id);
          }
        }
      } catch (error) {
        continuousRef.current.enabled = false;
        setContinuous(false);
        pausedRef.current = true;
        try {
          engine.request({ op: "pause" });
        } catch {
          /* Preserve the first runtime failure. */
        }
        reportError(message(error));
      }
    }, 50);
    const poll = window.setInterval(() => {
      try {
        const snapshot = engine.state();
        setState(snapshot);
        pausedRef.current = snapshot.paused;
        setMemoryBytes(engine.memoryBytes());
        pollCount += 1;
        if (pollCount % 5 === 0) {
          setRevision((value) => value + 1);
          setSamples((previous) => [
            ...previous.slice(-71),
            {
              now: snapshot.now_ms,
              live: snapshot.heap.live_objects,
              free: snapshot.heap.free_slots,
              capacity: snapshot.heap.capacity,
              bytes: engine.memoryBytes(),
            },
          ]);
        }
      } catch (error) {
        reportError(message(error));
      }
    }, 200);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [engine, reportError]);

  const command = (value: Record<string, unknown>) => {
    try {
      if (!engine) return false;
      engine.request(value);
      refresh();
      return true;
    } catch (error) {
      reportError(message(error));
      return false;
    }
  };
  const prepareRun = () => {
    if (!engine) throw new Error("Rust/WASM 엔진을 불러오는 중입니다.");
    const result = engine.request<Validation>({ op: "validate", workflow });
    setValidation(result);
    if (!result.valid) throw new Error(result.errors.join(" "));
    const value = parseInput(input);
    engine.request({ op: "load", workflow });
    return value;
  };
  const run = (count = 1, openMonitor = true) => {
    try {
      const value = prepareRun();
      let last: RunSummary | null = null;
      for (let i = 0; i < count; i++)
        last = engine!.request<RunSummary>({ op: "start", input: value });
      if (last) setSelectedRun(last.id);
      refresh();
      if (openMonitor) setPage("monitor");
      setNotice({
        text:
          count === 1
            ? `Run #${last?.id}을 시작했습니다.`
            : `현재 입력으로 Run ${count}개를 시작했습니다.`,
        error: false,
      });
    } catch (error) {
      reportError(message(error));
      refresh();
    }
  };
  const toggleContinuous = () => {
    if (continuousRef.current.enabled) {
      continuousRef.current.enabled = false;
      setContinuous(false);
      return;
    }
    try {
      const value = prepareRun();
      continuousRef.current = {
        enabled: true,
        elapsed: 0,
        input: value,
        workflow: structuredClone(workflow),
      };
      setContinuous(true);
      engine!.request({ op: "resume" });
      pausedRef.current = false;
      refresh();
      setNotice({
        text: "가상 시간 1초마다 반복 실행합니다. 시작 시점의 입력과 Workflow를 사용합니다.",
        error: false,
      });
    } catch (error) {
      reportError(message(error));
    }
  };
  const resetRuntime = () => {
    continuousRef.current.enabled = false;
    setContinuous(false);
    setSelectedRun(null);
    setReferenceRun(null);
    if (command({ op: "reset" })) {
      setSamples([]);
      setSelectedHandle(null);
      setDiagnosticsEpoch((value) => value + 1);
      setNotice({
        text: "실행을 초기화했습니다. 편집한 Workflow와 입력은 유지됩니다.",
        error: false,
      });
    }
  };
  const selectTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setWorkflow(structuredClone(template.workflow));
    setInput(json(template.input));
    setValidation(null);
  };
  const validate = () => {
    if (!engine) return;
    try {
      const result = engine.request<Validation>({ op: "validate", workflow });
      setValidation(result);
      setNotice({
        text: result.valid
          ? "검증을 통과했습니다. 모든 경로가 Output에 연결되어 있습니다."
          : `검증 오류 ${result.errors.length}개를 확인하세요.`,
        error: !result.valid,
      });
    } catch (error) {
      reportError(message(error));
    }
  };
  const trace = (handle: Handle, runId: number) => {
    setSelectedHandle(handle);
    setReferenceRun(runId);
    setDeveloperTab("references");
    setPage("developer");
    setRevision((value) => value + 1);
  };
  const latestRun = state?.runs.reduce<RunSummary | null>(
    (latest, item) => (!latest || item.id > latest.id ? item : latest),
    null,
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setPage("studio");
          }}
          aria-label="FlowRuntime 홈"
        >
          <span className="brand-mark">
            <Icon name="workflow" size={23} />
          </span>
          <span>
            FlowRuntime<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="main-nav" aria-label="주 메뉴">
          <button
            className={page === "studio" ? "active" : ""}
            onClick={() => setPage("studio")}
            aria-label="Workflow 편집"
          >
            <Icon name="workflow" size={16} />
            Workflow 편집
          </button>
          <button
            className={page === "monitor" ? "active" : ""}
            onClick={() => setPage("monitor")}
            aria-label="실행 결과"
          >
            <Icon name="activity" size={16} />
            실행 결과
            {state && state.active_runs > 0 && (
              <span className="nav-count">{state.active_runs}</span>
            )}
          </button>
          <button
            className={page === "developer" ? "active" : ""}
            onClick={() => setPage("developer")}
            aria-label="개발자 도구"
          >
            <Icon name="code" size={16} />
            개발자 도구
          </button>
        </nav>
        <div className="header-runtime">
          <span className="runtime-chip" data-testid="runtime-status">
            <span
              className={`status-light ${loadingError ? "status-error" : !engine ? "status-waiting" : ""}`}
            />
            {engine
              ? "Rust / WASM"
              : loadingError
                ? "Runtime 오류"
                : "WASM 로딩 중"}
          </span>
          <span className="local-mode">
            <Icon name="cpu" size={14} />
            브라우저에서 실행
          </span>
        </div>
      </header>
      {!engine || !state ? (
        <main className="boot-screen">
          <span className="brand-mark">
            <Icon name="workflow" size={36} />
          </span>
          <h1>
            {loadingError
              ? "실행 엔진을 시작하지 못했습니다"
              : "작업 공간을 준비하고 있습니다"}
          </h1>
          <p>{loadingError ?? "Rust/WASM 실행 엔진을 불러오고 있습니다…"}</p>
          {loadingError && (
            <button className="button" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
          )}
        </main>
      ) : (
        <>
          <div className="workspace-topbar">
            <div className="workspace-title">
              <div className="eyebrow">
                {page === "studio"
                  ? "1. 구성하고 실행하기"
                  : page === "monitor"
                    ? "2. 실행 결과 확인하기"
                    : "3. 내부 동작 살펴보기"}
              </div>
              <div>
                <h1>
                  {page === "studio"
                    ? displayLabel(workflow.name)
                    : page === "monitor"
                      ? "실행 결과"
                      : "개발자 도구"}
                </h1>
                {page === "studio" && (
                  <Badge tone={validation?.valid ? "completed" : "neutral"}>
                    {validation?.valid
                      ? "실행 준비 완료"
                      : validation
                        ? "확인 필요"
                        : "검증 중"}
                  </Badge>
                )}
              </div>
              <p>
                {page === "studio"
                  ? "템플릿을 고르고 실행해 보세요. 노드를 누르면 처리 규칙을 바꿀 수 있습니다."
                  : page === "monitor"
                    ? "Run 하나가 실행 한 번입니다. 왼쪽에서 Run을 고르면 처리 순서와 결과를 확인할 수 있습니다."
                    : "실행 중 생성된 객체와 GC의 회수 결과를 확인합니다. 일반 실행에는 이 화면을 사용할 필요가 없습니다."}
              </p>
            </div>
            <div className="primary-actions">
              <button
                className="button button-primary run-button"
                onClick={() => run()}
                disabled={!!inputError || !validation?.valid}
                aria-label="실행하기"
              >
                <Icon name="play" size={16} />
                실행하기<span className="button-shortcut">▶</span>
              </button>
            </div>
          </div>
          <div className="quick-guide" role="note">
            {page === "studio" ? (
              <>
                <strong>처음이라면 이렇게 해보세요</strong>
                <span>① 템플릿 선택</span>
                <span>② 입력 데이터 확인</span>
                <span>③ 실행하기 → 결과 확인</span>
              </>
            ) : page === "monitor" ? (
              <>
                <strong>확인할 곳</strong>
                <span>Task 처리 순서: 어떤 경로를 지났는지</span>
                <span>최종 결과: 입력이 어떻게 바뀌었는지</span>
              </>
            ) : (
              <>
                <strong>필요한 화면만 선택하세요</strong>
                <span>Heap: 남아 있는 객체</span>
                <span>GC: 회수 전후 비교</span>
                <span>References: 객체 사이의 연결</span>
              </>
            )}
          </div>
          <details className="advanced-controls">
            <summary>
              반복 실행·시간 제어{" "}
              {continuous && <span className="green-text">반복 실행 중</span>}{" "}
              {state.paused && <span>일시 정지 중</span>}
            </summary>
            <p className="advanced-help">
              Delay를 관찰할 때는 일시 정지 후 Step으로 시간을 진행하세요. 20회
              실행·반복 실행은 Heap과 GC의 변화를 볼 때 사용합니다.
            </p>
            <div className="secondary-actions">
              {" "}
              <button
                className={`button continuous-button ${continuous ? "button-pinned" : ""}`}
                onClick={toggleContinuous}
                disabled={!continuous && (!!inputError || !validation?.valid)}
                aria-pressed={continuous}
              >
                <Icon name={continuous ? "stop" : "reset"} size={15} />
                {continuous ? "반복 실행 중지" : "반복 실행"}
              </button>
              <button
                className="button"
                onClick={() => run(20, false)}
                disabled={!!inputError || !validation?.valid}
                title="현재 입력으로 Run 20개 시작"
              >
                <Icon name="bolt" size={15} />
                20회 실행
              </button>
            </div>
            <div className="execution-controlbar">
              <div className="scheduler-controls">
                <span
                  className={`scheduler-status ${state.paused ? "paused" : ""}`}
                >
                  <span className="status-light" />
                  {state.paused ? "일시 정지" : "시간 진행 중"}
                </span>
                <span className="toolbar-separator" />
                <button
                  className="icon-button"
                  onClick={() =>
                    command({ op: state.paused ? "resume" : "pause" })
                  }
                  title={state.paused ? "계속 실행" : "일시 정지"}
                  aria-label={state.paused ? "계속 실행" : "일시 정지"}
                >
                  <Icon name={state.paused ? "play" : "pause"} size={16} />
                </button>
                <button
                  className="button button-ghost button-small"
                  onClick={() => command({ op: "step", delta_ms: 100 })}
                  aria-label="Step +100 ms"
                >
                  <Icon name="step" size={15} />
                  Step<span>+100 ms</span>
                </button>
                <label className="speed-control">
                  <span>속도</span>
                  <select
                    aria-label="실행 속도"
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    {[0.5, 1, 2, 5, 10].map((value) => (
                      <option key={value} value={value}>
                        {value}×
                      </option>
                    ))}
                  </select>
                </label>
                <span className="virtual-time">
                  <Icon name="clock" size={14} />
                  <code>{duration(state.now_ms)}</code>
                  <span>가상 시간</span>
                </span>
              </div>
              <div className="runtime-reset-controls">
                <button
                  className="text-button muted"
                  onClick={() => {
                    if (command({ op: "clear_diagnostics" })) {
                      setSamples([]);
                      setDiagnosticsEpoch((value) => value + 1);
                      setNotice({
                        text: "진단 기록을 지웠습니다. 실행 중이거나 보존 중인 Run과 Pin한 Run은 유지됩니다.",
                        error: false,
                      });
                    }
                  }}
                >
                  <Icon name="trash" size={13} />
                  진단 기록 지우기
                </button>
                <button className="text-button muted" onClick={resetRuntime}>
                  <Icon name="reset" size={13} />
                  실행 초기화
                </button>
              </div>
            </div>
          </details>
          {notice && (
            <div
              className={`notice ${notice.error ? "notice-error" : "notice-success"}`}
              role={notice.error ? "alert" : "status"}
            >
              <Icon name={notice.error ? "info" : "check"} size={15} />
              <span>{notice.text}</span>
              <button
                className="icon-button"
                onClick={() => setNotice(null)}
                aria-label="알림 닫기"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <main className={`workspace-main page-${page}`}>
            {page === "studio" && (
              <Studio
                workflow={workflow}
                onWorkflow={setWorkflow}
                input={input}
                onInput={setInput}
                validation={validation}
                onValidate={validate}
                onTemplate={selectTemplate}
                onResetWorkflow={() =>
                  selectTemplate(
                    templates.find((template) => template.id === workflow.id)
                      ?.id ?? templates[0].id,
                  )
                }
                inputError={inputError}
                saveStatus={saveStatus}
              />
            )}
            {page === "monitor" && (
              <Monitor
                engine={engine}
                state={state}
                selectedRun={selectedRun ?? latestRun?.id ?? null}
                onSelect={setSelectedRun}
                onTrace={trace}
                onCommand={command}
                onRun={() => run()}
              />
            )}
            {page === "developer" && (
              <DeveloperTools
                key={diagnosticsEpoch}
                engine={engine}
                state={state}
                memoryBytes={memoryBytes}
                samples={samples}
                revision={revision}
                tab={developerTab}
                onTab={setDeveloperTab}
                selectedHandle={selectedHandle}
                onHandle={setSelectedHandle}
                referenceRun={referenceRun}
                onReferenceRun={setReferenceRun}
                onCommand={command}
                onRefresh={refresh}
                onError={reportError}
              />
            )}
          </main>
          <footer className="runtime-footer">
            <div className="footer-runtime">
              <Icon name="cpu" size={14} />
              <strong>엔진 연결됨</strong>
              <span className="dot-separator">·</span>
              <span>모든 실행은 이 브라우저 안에서 처리됩니다</span>
            </div>
            <div className="footer-metrics">
              <span>
                <i className="small-dot" />
                실행 중 {number(state.active_runs)}개
              </span>
              <span>객체 {number(state.heap.live_objects)}개</span>
              <span>GC {number(state.gc.cycles)}회</span>
              <span>{bytes(memoryBytes)} WASM</span>
              {latestRun && (
                <button
                  className="footer-latest"
                  onClick={() => {
                    setSelectedRun(latestRun.id);
                    setPage("monitor");
                  }}
                >
                  최근 Run #{latestRun.id}
                  <Icon name="arrow" size={12} />
                </button>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
