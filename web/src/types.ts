export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type NodeKind =
  | "trigger"
  | "transform"
  | "condition"
  | "delay"
  | "output";
export type NodeConfig = Record<string, Json>;
export interface WorkflowNode {
  id: string;
  label: string;
  kind: NodeKind;
  config: NodeConfig;
  position: { x: number; y: number };
}
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  branch?: "true" | "false";
}
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
export interface Handle {
  index: number;
  generation: number;
}
export interface RunSummary {
  id: number;
  name: string;
  status: "running" | "waiting" | "completed" | "failed" | "cancelled";
  started_at: number;
  completed_at: number | null;
  handle: Handle;
  pinned: boolean;
  retained: boolean;
  collected: boolean;
  task_count: number;
  result: Json;
  error: string | null;
}
export interface TaskView {
  node_id: string;
  label: string;
  kind: string;
  status: string;
  started_at: number;
  completed_at: number | null;
  handle: Handle;
  input: Json;
  output: Json;
  error: string | null;
}
export interface RunDetail extends RunSummary {
  workflow: Workflow;
  tasks: TaskView[];
}
export interface HeapStats {
  live_objects: number;
  capacity: number;
  free_slots: number;
  retired_slots: number;
  allocations: number;
  reused_slots: number;
  by_type: Record<string, number>;
}
export interface GcCycle {
  cycle: number;
  at_ms: number;
  roots: number;
  before: number;
  marked: number;
  swept: number;
  reclaimed: number;
  free_slots: number;
  mark_ms: number;
  sweep_ms: number;
  pause_ms: number;
}
export interface GcStats {
  cycles: number;
  total_reclaimed: number;
  cumulative_ms: number;
  last: GcCycle | null;
  history: GcCycle[];
}
export interface RootView {
  handle: Handle;
  reason: string;
}
export interface EngineState {
  now_ms: number;
  paused: boolean;
  auto_gc: boolean;
  pending_events: number;
  active_runs: number;
  retained_runs: number;
  pinned_runs: number;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  runs: RunSummary[];
  heap: HeapStats;
  gc: GcStats;
  roots: RootView[];
  limits: {
    max_runs: number;
    max_nodes: number;
    max_events: number;
    max_payload_bytes: number;
    max_virtual_ms: number;
    max_steps: number;
    retention_ms: number;
    history_limit: number;
  };
}
export interface ObjectView {
  handle: Handle;
  kind: "Run" | "Task" | "Value" | "Continuation";
  label: string;
  references: Handle[];
  root: boolean;
  reachable: boolean;
  marked: boolean;
  payload?: Json;
}
export interface SlotView {
  index: number;
  generation: number;
  state: "occupied" | "free" | "retired";
  kind: string | null;
  marked: boolean;
  reachable: boolean;
}
export interface HeapSnapshot {
  stats: HeapStats;
  slots: SlotView[];
  objects: ObjectView[];
  truncated: boolean;
}
export interface ReferenceGraph {
  objects: ObjectView[];
  roots: RootView[];
  truncated: boolean;
}
export interface Inspection {
  valid: boolean;
  object?: ObjectView;
  error?: string;
}
export interface Validation {
  valid: boolean;
  errors: string[];
}
export const handleKey = (handle: Handle) =>
  `${handle.index}:${handle.generation}`;
