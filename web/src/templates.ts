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
    name: "주문 분류",
    description: "주문 금액에 따라 자동 승인 또는 수동 검토로 분류합니다.",
    input: {
      order_id: "ORD-1042",
      customer: "Alex Morgan",
      amount: 1250,
      currency: "USD",
    },
    workflow: {
      id: "order-routing",
      name: "주문 분류",
      nodes: [
        node("new-order", "주문 입력", "trigger", 300, 0),
        node("normalize", "검증 상태 추가", "transform", 300, 125, {
          field: "validated",
          value: true,
        }),
        node("check-amount", "주문 금액 비교", "condition", 300, 250, {
          field: "amount",
          operator: "gte",
          value: 1000,
        }),
        node("manual-review", "수동 검토로 분류", "transform", 80, 400, {
          field: "decision",
          value: "manual_review",
        }),
        node("auto-approve", "자동 승인으로 분류", "transform", 520, 400, {
          field: "decision",
          value: "approved",
        }),
        node("review-result", "검토 결과", "output", 80, 535),
        node("approval-result", "승인 결과", "output", 520, 535),
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
    name: "장애 분류",
    description:
      "장애 심각도에 따라 담당자를 정하고 Delay 뒤 결과를 확인합니다.",
    input: { incident_id: "INC-087", service: "checkout", severity: 4 },
    workflow: {
      id: "incident-triage",
      name: "장애 분류",
      nodes: [
        node("incident", "장애 입력", "trigger", 300, 0),
        node("severity", "심각도 비교", "condition", 300, 125, {
          field: "severity",
          operator: "gte",
          value: 3,
        }),
        node("oncall", "당직 담당자 지정", "transform", 80, 270, {
          field: "owner",
          value: "on-call",
        }),
        node("backlog", "지원 담당자 지정", "transform", 520, 270, {
          field: "owner",
          value: "support",
        }),
        node("escalation", "보고 전 대기", "delay", 80, 410, {
          duration_ms: 3000,
        }),
        node("review-window", "검토 전 대기", "delay", 520, 410, {
          duration_ms: 1500,
        }),
        node("urgent-result", "보고 결과", "output", 80, 550),
        node("support-result", "지원 결과", "output", 520, 550),
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
    name: "데이터 처리",
    description: "데이터에 필드를 추가하고 점수에 따라 결과를 분류합니다.",
    input: { record_id: "REC-301", score: 82, source: "local-input" },
    workflow: {
      id: "data-processing",
      name: "데이터 처리",
      nodes: [
        node("event", "데이터 입력", "trigger", 300, 0),
        node("enrich", "처리 상태 추가", "transform", 300, 130, {
          field: "processed",
          value: true,
        }),
        node("quality", "점수 비교", "condition", 300, 260, {
          field: "score",
          operator: "gte",
          value: 70,
        }),
        node("accept", "통과 결과", "output", 80, 415),
        node("reject", "확인 필요", "output", 520, 415),
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
