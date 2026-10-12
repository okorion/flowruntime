// Display-only labels: saved definitions, payload fields and engine contracts stay intact.
const names: Record<string, string> = {
  "Order Routing": "주문 분류",
  "Incident Triage": "장애 분류",
  "Data Processing": "데이터 처리",
  "New order": "주문 입력",
  "Validate order": "검증 상태 추가",
  "Check amount": "주문 금액 비교",
  "Manual review": "수동 검토로 분류",
  "Auto approve": "자동 승인으로 분류",
  "Review result": "검토 결과",
  "Approval result": "승인 결과",
  "Incident received": "장애 입력",
  "Check severity": "심각도 비교",
  "Assign on-call": "당직 담당자 지정",
  "Assign support": "지원 담당자 지정",
  "Escalation window": "보고 전 대기",
  "Review window": "검토 전 대기",
  "Escalated incident": "보고 결과",
  "Support ticket": "지원 결과",
  "Record received": "데이터 입력",
  "Enrich record": "처리 상태 추가",
  "Quality gate": "점수 비교",
  "Accepted record": "통과 결과",
  "Needs attention": "확인 필요",
};
export const displayLabel = (value: string) => names[value] ?? value;
const statuses: Record<string, string> = {
  running: "실행 중",
  waiting: "대기 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
  occupied: "점유",
  free: "비어 있음",
  retired: "재사용 중단",
  active: "실행 중",
  retained: "보존 기간 내",
  pinned: "Pin 보존",
  scheduler: "스케줄러 대기",
};
export const statusLabel = (value: string) =>
  value
    .split(", ")
    .map(
      (part) =>
        ({
          "active run": "실행 중인 Run",
          "completed run retention": "완료 Run 보존 기간",
          "user pin": "사용자 Pin",
          "scheduler continuation": "스케줄러의 Continuation",
        })[part] ??
        statuses[part] ??
        part,
    )
    .join(", ");

export const canvasLabels = {
  "controls.zoomIn.ariaLabel": "확대",
  "controls.zoomOut.ariaLabel": "축소",
  "controls.fitView.ariaLabel": "그래프 위치 맞추기",
  "minimap.ariaLabel": "전체 그래프 지도",
};

export function errorText(value: string): string {
  const exact: Record<string, string> = {
    "Workflow requires exactly one Trigger": "Trigger가 정확히 1개 필요합니다.",
    "Workflow requires 1–64 nodes": "노드는 1~64개여야 합니다.",
    "Workflow allows at most 128 edges":
      "Edge는 최대 128개까지 연결할 수 있습니다.",
    "Workflow must be a DAG (cycles are unsupported)":
      "Workflow에 순환 연결이 있습니다. 되돌아가는 Edge를 제거하세요.",
    "All nodes must be reachable from the Trigger":
      "모든 노드가 Trigger에서 이어져 있어야 합니다.",
    "Edge ids must be unique and nonempty":
      "Edge ID는 비어 있거나 중복될 수 없습니다.",
    "Workflow exceeds 128 KiB": "Workflow 정의가 128 KiB 제한을 초과했습니다.",
    "Input and transformed values must be JSON objects":
      "입력과 변환 결과는 JSON 객체여야 합니다.",
    "At most 64 runs may be pinned":
      "Pin으로 보존할 수 있는 Run은 최대 64개입니다.",
    "At most 256 concurrent runs are allowed":
      "동시에 실행할 수 있는 Run은 최대 256개입니다.",
    "Pending event limit reached":
      "대기 이벤트 한도에 도달했습니다. 기존 Run을 완료하거나 취소하세요.",
    "Run exceeded its 120000 ms virtual-time timeout":
      "Run이 가상 시간 120,000 ms 제한을 초과했습니다.",
    "Heap safety limit reached. Enable automatic GC, collect garbage, unpin runs, or reset the runtime.":
      "Heap 안전 한도에 도달했습니다. 자동 GC를 켜거나, GC 실행·Pin 해제·실행 초기화를 사용하세요.",
  };
  if (exact[value]) return exact[value];
  const rules: [RegExp, (...args: string[]) => string][] = [
    [
      /^(.+) must have (\d+) incoming edge\(s\); joins are unsupported$/,
      (_, id, count) =>
        `${id}: 입력 Edge가 ${count}개 필요합니다. Join은 지원하지 않습니다.`,
    ],
    [
      /^(.+) requires exactly one true and one false edge$/,
      (_, id) => `${id}: True와 False 경로를 각각 하나씩 연결하세요.`,
    ],
    [
      /^(.+) requires exactly one unlabelled outgoing edge$/,
      (_, id) => `${id}: 다음 노드로 향하는 Edge를 하나 연결하세요.`,
    ],
    [
      /^(.+) references a missing node$/,
      (_, id) => `${id}: 존재하지 않는 노드에 연결되어 있습니다.`,
    ],
    [
      /^(.+) Output cannot have outgoing edges$/,
      (_, id) => `${id}: Output 뒤에는 노드를 연결할 수 없습니다.`,
    ],
    [
      /^Transform '(.+)' was configured to fail$/,
      (_, label) =>
        `${displayLabel(label)}: 오류 재현 설정(fail: true)으로 실행이 중단됐습니다.`,
    ],
    [
      /^Payload exceeds (\d+) bytes$/,
      (_, size) => `Payload가 ${size} bytes 제한을 초과했습니다.`,
    ],
    [
      /^(.+) config must be an object$/,
      (_, id) => `${id}: 설정은 JSON 객체여야 합니다.`,
    ],
    [
      /^(.+) transform requires field and value$/,
      (_, id) => `${id}: Transform에 field와 value가 필요합니다.`,
    ],
    [
      /^(.+) condition requires (field|value)$/,
      (_, id, field) => `${id}: Condition에 ${field}가 필요합니다.`,
    ],
    [
      /^(.+) condition operator is unsupported$/,
      (_, id) =>
        `${id}: 지원하지 않는 비교 연산자입니다. eq, ne, gt, gte, lt, lte, exists를 사용하세요.`,
    ],
    [
      /^(?:Unexpected token|Unexpected end|Expected property|Expected double|Unterminated string)[\s\S]*$/,
      () =>
        "JSON 형식을 확인하세요. 키와 문자열에는 큰따옴표를 사용하고 쉼표·괄호가 맞는지 확인하세요.",
    ],
    [
      /^[\s\S]*(?:stale|invalid handle)[\s\S]*$/i,
      () => "이 Handle은 유효하지 않거나 객체가 이미 회수되었습니다.",
    ],
  ];
  rules.push(
    [
      /^(.+) numeric comparison requires a numeric value$/,
      (_, id) => `${id}: 숫자 비교의 value에는 숫자를 입력하세요.`,
    ],
    [
      /^(.+) delay must be an integer from 0 to 60000 ms$/,
      (_, id) => `${id}: duration_ms는 0~60,000 사이 정수여야 합니다.`,
    ],
    [
      /^(.+) fail must be boolean$/,
      (_, id) => `${id}: fail에는 true 또는 false를 입력하세요.`,
    ],
    [
      /^(.+) transform config exceeds payload limit$/,
      (_, id) => `${id}: Transform 설정이 Payload 한도를 초과했습니다.`,
    ],
    [
      /^Invalid or duplicate node id\/label: (.+)$/,
      (_, id) => `${id}: 노드 ID 또는 이름이 비어 있거나 중복됐습니다.`,
    ],
    [
      /^Invalid position: (.+)$/,
      (_, id) => `${id}: 노드 위치가 유효하지 않습니다.`,
    ],
    [
      /^(.+) has an unknown node kind$/,
      (_, id) => `${id}: 지원하지 않는 노드 유형입니다.`,
    ],
  );
  for (const [pattern, format] of rules) {
    const match = value.match(pattern);
    if (match) return format(...match);
  }
  return value;
}
