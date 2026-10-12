import { useCallback, useEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import './styles/app.css';
import { createEngine, type EngineClient } from './engine';
import { templates } from './templates';
import type { EngineState, Handle, RunSummary, Validation, Workflow } from './types';
import { Studio } from './components/Studio';
import { Monitor } from './components/Monitor';
import { DeveloperTools, type DeveloperTab, type MemorySample } from './components/DeveloperTools';
import { Badge, bytes, duration, Icon, json, number } from './components/ui';

type Page = 'studio' | 'monitor' | 'developer';
const STORAGE_KEY = 'flowruntime.workspace.v1';
const nodeKinds = new Set(['trigger', 'transform', 'condition', 'delay', 'output']);
function safeWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== 'object') return false;
  const workflow = value as Workflow;
  return typeof workflow.id === 'string' && typeof workflow.name === 'string' && Array.isArray(workflow.nodes) && workflow.nodes.length <= 64 && Array.isArray(workflow.edges) && workflow.edges.length <= 128 && workflow.nodes.every(node => node && typeof node.id === 'string' && typeof node.label === 'string' && nodeKinds.has(node.kind) && node.config != null && typeof node.config === 'object' && !Array.isArray(node.config) && node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) && workflow.edges.every(edge => edge && typeof edge.id === 'string' && typeof edge.source === 'string' && typeof edge.target === 'string' && (edge.branch === undefined || edge.branch === 'true' || edge.branch === 'false'));
}
function readDraft(): { workflow: Workflow; input: string; restored: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length < 1024 * 1024) {
      const draft = JSON.parse(raw) as { workflow?: unknown; input?: unknown };
      if (safeWorkflow(draft.workflow) && typeof draft.input === 'string') return { workflow: draft.workflow, input: draft.input, restored: true };
    }
  } catch { /* A blocked or malformed local store falls back to the default template. */ }
  return { workflow: structuredClone(templates[0].workflow), input: json(templates[0].input), restored: false };
}
function parseInput(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Event input must be a JSON object.');
  return parsed as Record<string, unknown>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function App() {
  const [draft] = useState(readDraft);
  const [workflow, setWorkflow] = useState(draft.workflow);
  const [input, setInput] = useState(draft.input);
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [memoryBytes, setMemoryBytes] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('studio');
  const [developerTab, setDeveloperTab] = useState<DeveloperTab>('heap');
  const [validation, setValidation] = useState<Validation | null>(null);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<Handle | null>(null);
  const [referenceRun, setReferenceRun] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [revision, setRevision] = useState(0);
  const [diagnosticsEpoch, setDiagnosticsEpoch] = useState(0);
  const [samples, setSamples] = useState<MemorySample[]>([]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [saveStatus, setSaveStatus] = useState(draft.restored ? 'Restored locally' : 'Saved locally');
  const speedRef = useRef(1);
  const continuousRef = useRef({ enabled: false, elapsed: 0, input: {} as Record<string, unknown>, workflow: draft.workflow });
  const pausedRef = useRef(false);
  const engineRef = useRef<EngineClient | null>(null);
  let inputError: string | null = null;
  try { parseInput(input); } catch (error) { inputError = message(error); }

  const reportError = useCallback((text: string) => setNotice({ text, error: true }), []);
  const refresh = useCallback(() => {
    const client = engineRef.current;
    if (!client) return;
    const snapshot = client.state();
    setState(snapshot); pausedRef.current = snapshot.paused; setMemoryBytes(client.memoryBytes()); setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    let client: EngineClient | undefined;
    createEngine().then(value => {
      client = value;
      if (!alive) { value.dispose(); return; }
      engineRef.current = value; setEngine(value); const initial = value.state(); setState(initial); pausedRef.current = initial.paused; setMemoryBytes(value.memoryBytes()); setSamples([{ now: initial.now_ms, live: initial.heap.live_objects, free: initial.heap.free_slots, capacity: initial.heap.capacity, bytes: value.memoryBytes() }]);
    }).catch(error => { if (alive) setLoadingError(message(error)); });
    return () => { alive = false; if (engineRef.current === client) engineRef.current = null; client?.dispose(); };
  }, []);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflow, input })); setSaveStatus('Saved locally'); } catch { setSaveStatus('Local save unavailable'); } }, 350);
    return () => window.clearTimeout(timer);
  }, [workflow, input]);
  useEffect(() => {
    if (!engine) return;
    const timer = window.setTimeout(() => { try { setValidation(engine.request<Validation>({ op: 'validate', workflow })); } catch (error) { setValidation({ valid: false, errors: [message(error)] }); } }, 150);
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
        engine.request({ op: 'tick', delta_ms: delta });
        if (continuousRef.current.enabled) {
          continuousRef.current.elapsed += delta;
          if (continuousRef.current.elapsed >= 1000) { continuousRef.current.elapsed -= 1000; engine.request({ op: 'load', workflow: continuousRef.current.workflow }); const run = engine.request<RunSummary>({ op: 'start', input: continuousRef.current.input }); setSelectedRun(run.id); }
        }
      } catch (error) { continuousRef.current.enabled = false; setContinuous(false); pausedRef.current = true; try { engine.request({ op: 'pause' }); } catch { /* Preserve the first runtime failure. */ } reportError(message(error)); }
    }, 50);
    const poll = window.setInterval(() => {
      try {
        const snapshot = engine.state(); setState(snapshot); pausedRef.current = snapshot.paused; setMemoryBytes(engine.memoryBytes()); pollCount += 1;
        if (pollCount % 5 === 0) { setRevision(value => value + 1); setSamples(previous => [...previous.slice(-71), { now: snapshot.now_ms, live: snapshot.heap.live_objects, free: snapshot.heap.free_slots, capacity: snapshot.heap.capacity, bytes: engine.memoryBytes() }]); }
      } catch (error) { reportError(message(error)); }
    }, 200);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [engine, reportError]);

  const command = (value: Record<string, unknown>) => { try { if (!engine) return false; engine.request(value); refresh(); return true; } catch (error) { reportError(message(error)); return false; } };
  const prepareRun = () => {
    if (!engine) throw new Error('The Rust/WASM runtime is still loading.');
    const result = engine.request<Validation>({ op: 'validate', workflow }); setValidation(result);
    if (!result.valid) throw new Error(result.errors.join(' '));
    const value = parseInput(input);
    engine.request({ op: 'load', workflow });
    return value;
  };
  const run = (count = 1, openMonitor = true) => {
    try {
      const value = prepareRun(); let last: RunSummary | null = null;
      for (let i = 0; i < count; i++) last = engine!.request<RunSummary>({ op: 'start', input: value });
      if (last) setSelectedRun(last.id);
      refresh(); if (openMonitor) setPage('monitor');
      setNotice({ text: count === 1 ? `Execution #${last?.id} started.` : `${count} executions started with the current input.`, error: false });
    } catch (error) { reportError(message(error)); refresh(); }
  };
  const toggleContinuous = () => {
    if (continuousRef.current.enabled) { continuousRef.current.enabled = false; setContinuous(false); return; }
    try { const value = prepareRun(); continuousRef.current = { enabled: true, elapsed: 0, input: value, workflow: structuredClone(workflow) }; setContinuous(true); engine!.request({ op: 'resume' }); pausedRef.current = false; refresh(); setNotice({ text: 'Continuous execution: one event every virtual second. Input and workflow are captured when enabled.', error: false }); }
    catch (error) { reportError(message(error)); }
  };
  const resetRuntime = () => {
    continuousRef.current.enabled = false; setContinuous(false); setSelectedRun(null); setReferenceRun(null);
    if (command({ op: 'reset' })) { setSamples([]); setSelectedHandle(null); setDiagnosticsEpoch(value => value + 1); setNotice({ text: 'Runtime reset. Your workflow and event input are preserved.', error: false }); }
  };
  const selectTemplate = (id: string) => {
    const template = templates.find(item => item.id === id); if (!template) return;
    setWorkflow(structuredClone(template.workflow)); setInput(json(template.input)); setValidation(null);
  };
  const validate = () => { if (!engine) return; try { const result = engine.request<Validation>({ op: 'validate', workflow }); setValidation(result); setNotice({ text: result.valid ? 'Workflow validated. All paths lead to an output.' : `${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} to resolve.`, error: !result.valid }); } catch (error) { reportError(message(error)); } };
  const trace = (handle: Handle, runId: number) => { setSelectedHandle(handle); setReferenceRun(runId); setDeveloperTab('references'); setPage('developer'); setRevision(value => value + 1); };
  const latestRun = state?.runs.reduce<RunSummary | null>((latest, item) => !latest || item.id > latest.id ? item : latest, null);

  return <div className="app-shell"><header className="app-header"><a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('studio'); }} aria-label="FlowRuntime home"><span className="brand-mark"><Icon name="workflow" size={23}/></span><span>FlowRuntime<span className="brand-dot">.</span></span></a><nav className="main-nav" aria-label="Main navigation"><button className={page === 'studio' ? 'active' : ''} onClick={() => setPage('studio')} aria-label="Workflow Studio"><Icon name="workflow" size={16}/>Workflow Studio</button><button className={page === 'monitor' ? 'active' : ''} onClick={() => setPage('monitor')} aria-label="Execution Monitor"><Icon name="activity" size={16}/>Executions{state && state.active_runs > 0 && <span className="nav-count">{state.active_runs}</span>}</button><button className={page === 'developer' ? 'active' : ''} onClick={() => setPage('developer')} aria-label="Developer Tools"><Icon name="code" size={16}/>Developer Tools</button></nav><div className="header-runtime"><span className="runtime-chip" data-testid="runtime-status"><span className={`status-light ${loadingError ? 'status-error' : !engine ? 'status-waiting' : ''}`}/>{engine ? 'Rust / WASM' : loadingError ? 'Runtime error' : 'Loading WASM'}</span><span className="local-mode"><Icon name="cpu" size={14}/>Local-first</span></div></header>
    {!engine || !state ? <main className="boot-screen"><span className="brand-mark"><Icon name="workflow" size={36}/></span><h1>{loadingError ? 'The runtime could not start' : 'Preparing your workspace'}</h1><p>{loadingError ?? 'Loading the Rust/WebAssembly execution engine…'}</p>{loadingError && <button className="button" onClick={() => window.location.reload()}>Retry loading</button>}</main> : <>
      <div className="workspace-topbar"><div className="workspace-title"><div className="eyebrow">{page === 'studio' ? 'BUILD & EXECUTE' : page === 'monitor' ? 'OBSERVE & INSPECT' : 'EXPLORE THE RUNTIME'}</div><div><h1>{page === 'studio' ? workflow.name : page === 'monitor' ? 'Execution monitor' : 'Developer tools'}</h1>{page === 'studio' && <Badge tone={validation?.valid ? 'completed' : 'neutral'}>{validation?.valid ? 'Ready' : validation ? 'Needs attention' : 'Checking'}</Badge>}</div><p>{page === 'studio' ? 'Turn events into outcomes. One connected step at a time.' : page === 'monitor' ? 'Every input, every step, every result — in one place.' : 'Inspect the real heap, collector, and reference graph behind your runs.'}</p></div><div className="primary-actions"><button className={`button continuous-button ${continuous ? 'button-pinned' : ''}`} onClick={toggleContinuous} disabled={!continuous && (!!inputError || !validation?.valid)} aria-pressed={continuous}><Icon name={continuous ? 'stop' : 'reset'} size={15}/>{continuous ? 'Stop continuous' : 'Continuous'}</button><button className="button" onClick={() => run(20, false)} disabled={!!inputError || !validation?.valid} title="Start 20 runs with the current input"><Icon name="bolt" size={15}/>Burst ×20</button><button className="button button-primary run-button" onClick={() => run()} disabled={!!inputError || !validation?.valid} aria-label="Run workflow"><Icon name="play" size={16}/>Run workflow<span className="button-shortcut">▶</span></button></div></div>
      <div className="execution-controlbar"><div className="scheduler-controls"><span className={`scheduler-status ${state.paused ? 'paused' : ''}`}><span className="status-light"/>{state.paused ? 'Paused' : 'Runtime running'}</span><span className="toolbar-separator"/><button className="icon-button" onClick={() => command({ op: state.paused ? 'resume' : 'pause' })} title={state.paused ? 'Resume execution' : 'Pause execution'} aria-label={state.paused ? 'Resume execution' : 'Pause execution'}><Icon name={state.paused ? 'play' : 'pause'} size={16}/></button><button className="button button-ghost button-small" onClick={() => command({ op: 'step', delta_ms: 100 })} aria-label="Step +100 ms"><Icon name="step" size={15}/>Step<span>+100 ms</span></button><label className="speed-control"><span>Speed</span><select aria-label="Execution speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.5, 1, 2, 5, 10].map(value => <option key={value} value={value}>{value}×</option>)}</select></label><span className="virtual-time"><Icon name="clock" size={14}/><code>{duration(state.now_ms)}</code><span>virtual</span></span></div><div className="runtime-reset-controls"><button className="text-button muted" onClick={() => { if (command({ op: 'clear_diagnostics' })) { setSamples([]); setDiagnosticsEpoch(value => value + 1); setNotice({ text: 'Expired diagnostic history cleared. Active, pinned, and retained runs remain protected.', error: false }); } }}><Icon name="trash" size={13}/>Clear diagnostics</button><button className="text-button muted" onClick={resetRuntime}><Icon name="reset" size={13}/>Reset runtime</button></div></div>
      {notice && <div className={`notice ${notice.error ? 'notice-error' : 'notice-success'}`} role={notice.error ? 'alert' : 'status'}><Icon name={notice.error ? 'info' : 'check'} size={15}/><span>{notice.text}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><Icon name="close" size={14}/></button></div>}
      <main className={`workspace-main page-${page}`}>
        {page === 'studio' && <Studio workflow={workflow} onWorkflow={setWorkflow} input={input} onInput={setInput} validation={validation} onValidate={validate} onTemplate={selectTemplate} onResetWorkflow={() => selectTemplate(templates.find(template => template.id === workflow.id)?.id ?? templates[0].id)} inputError={inputError} saveStatus={saveStatus}/>}
        {page === 'monitor' && <Monitor engine={engine} state={state} selectedRun={selectedRun ?? latestRun?.id ?? null} onSelect={setSelectedRun} onTrace={trace} onCommand={command} onRun={() => run()}/>}
        {page === 'developer' && <DeveloperTools key={diagnosticsEpoch} engine={engine} state={state} memoryBytes={memoryBytes} samples={samples} revision={revision} tab={developerTab} onTab={setDeveloperTab} selectedHandle={selectedHandle} onHandle={setSelectedHandle} referenceRun={referenceRun} onReferenceRun={setReferenceRun} onCommand={command} onRefresh={refresh} onError={reportError}/>}
      </main>
      <footer className="runtime-footer"><div className="footer-runtime"><Icon name="cpu" size={14}/><strong>Engine connected</strong><span className="dot-separator">·</span><span>Everything runs in your browser</span></div><div className="footer-metrics"><span><i className="small-dot"/>{number(state.active_runs)} active</span><span>{number(state.heap.live_objects)} objects</span><span>{number(state.gc.cycles)} GC cycles</span><span>{bytes(memoryBytes)} WASM</span>{latestRun && <button className="footer-latest" onClick={() => { setSelectedRun(latestRun.id); setPage('monitor'); }}>Latest #{latestRun.id}<Icon name="arrow" size={12}/></button>}</div></footer>
    </>}
  </div>;
}
