import type { NodeConfig, NodeKind, Workflow, WorkflowNode } from "./types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  workflow: Workflow;
  input: Record<string, unknown>;
}
export function defaultConfig(kind: NodeKind): NodeConfig {
  if (kind === "transform") return { field: "status", value: "processed" };
  if (kind === "condition")
    return { field: "amount", operator: "gte", value: 1000 };
  if (kind === "delay") return { duration_ms: 2000 };
  return {};
}
const node = (
  id: string,
  label: string,
  kind: NodeKind,
  x: number,
  y: number,
  config: NodeConfig = {},
): WorkflowNode => ({ id, label, kind, config, position: { x, y } });
const edge = (source: string, target: string, branch?: "true" | "false") => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(branch ? { branch } : {}),
});

export const templates: WorkflowTemplate[] = [
  {
    id: "order-routing",
    name: "Order Routing",
    description:
      "Route orders by value. Approve the everyday. Review the exceptional.",
    input: {
      order_id: "ORD-1042",
      customer: "Alex Morgan",
      amount: 1250,
      currency: "USD",
    },
    workflow: {
      id: "order-routing",
      name: "Order Routing",
      nodes: [
        node("new-order", "New order", "trigger", 300, 0),
        node("normalize", "Validate order", "transform", 300, 125, {
          field: "validated",
          value: true,
        }),
        node("check-amount", "Check amount", "condition", 300, 250, {
          field: "amount",
          operator: "gte",
          value: 1000,
        }),
        node("manual-review", "Manual review", "transform", 80, 400, {
          field: "decision",
          value: "manual_review",
        }),
        node("auto-approve", "Auto approve", "transform", 520, 400, {
          field: "decision",
          value: "approved",
        }),
        node("review-result", "Review result", "output", 80, 535),
        node("approval-result", "Approval result", "output", 520, 535),
      ],
      edges: [
        edge("new-order", "normalize"),
        edge("normalize", "check-amount"),
        edge("check-amount", "manual-review", "true"),
        edge("check-amount", "auto-approve", "false"),
        edge("manual-review", "review-result"),
        edge("auto-approve", "approval-result"),
      ],
    },
  },
  {
    id: "incident-triage",
    name: "Incident Triage",
    description:
      "Classify an incident, capture a continuation, and resume after a delay.",
    input: { incident_id: "INC-087", service: "checkout", severity: 4 },
    workflow: {
      id: "incident-triage",
      name: "Incident Triage",
      nodes: [
        node("incident", "Incident received", "trigger", 300, 0),
        node("severity", "Check severity", "condition", 300, 125, {
          field: "severity",
          operator: "gte",
          value: 3,
        }),
        node("oncall", "Assign on-call", "transform", 80, 270, {
          field: "owner",
          value: "on-call",
        }),
        node("backlog", "Assign support", "transform", 520, 270, {
          field: "owner",
          value: "support",
        }),
        node("escalation", "Escalation window", "delay", 80, 410, {
          duration_ms: 3000,
        }),
        node("review-window", "Review window", "delay", 520, 410, {
          duration_ms: 1500,
        }),
        node("urgent-result", "Escalated incident", "output", 80, 550),
        node("support-result", "Support ticket", "output", 520, 550),
      ],
      edges: [
        edge("incident", "severity"),
        edge("severity", "oncall", "true"),
        edge("severity", "backlog", "false"),
        edge("oncall", "escalation"),
        edge("backlog", "review-window"),
        edge("escalation", "urgent-result"),
        edge("review-window", "support-result"),
      ],
    },
  },
  {
    id: "data-processing",
    name: "Data Processing",
    description:
      "Enrich incoming records and route valid data through a deterministic pipeline.",
    input: { record_id: "REC-301", score: 82, source: "local-input" },
    workflow: {
      id: "data-processing",
      name: "Data Processing",
      nodes: [
        node("event", "Record received", "trigger", 300, 0),
        node("enrich", "Enrich record", "transform", 300, 130, {
          field: "processed",
          value: true,
        }),
        node("quality", "Quality gate", "condition", 300, 260, {
          field: "score",
          operator: "gte",
          value: 70,
        }),
        node("accept", "Accepted record", "output", 80, 415),
        node("reject", "Needs attention", "output", 520, 415),
      ],
      edges: [
        edge("event", "enrich"),
        edge("enrich", "quality"),
        edge("quality", "accept", "true"),
        edge("quality", "reject", "false"),
      ],
    },
  },
];
