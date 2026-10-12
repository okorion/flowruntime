import { displayLabel, errorText, canvasLabels } from "../labels";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type NodeProps,
  type NodeChange,
  type Edge,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type { NodeKind, Validation, Workflow, WorkflowNode } from "../types";
import { defaultConfig, templates } from "../templates";
import { Badge, Icon, type IconName, json } from "./ui";

const kindIcons: Record<NodeKind, IconName> = {
  trigger: "bolt",
  transform: "code",
  condition: "branch",
  delay: "clock",
  output: "box",
};
const kindLabels: Record<NodeKind, string> = {
  trigger: "Trigger",
  transform: "Transform",
  condition: "Condition",
  delay: "Delay",
  output: "Output",
};
const kindDescriptions: Record<NodeKind, string> = {
  trigger: "입력 데이터를 받아 실행을 시작합니다",
  transform: "데이터의 필드 값을 바꿉니다",
  condition: "조건에 따라 True 또는 False 경로로 진행합니다",
  delay: "정해진 가상 시간만큼 기다립니다",
  output: "최종 결과를 반환합니다",
};

function nodeDescription(node: WorkflowNode) {
  if (node.kind === "trigger") return "입력을 받아 시작";
  if (node.kind === "output") return "실행 결과 반환";
  if (node.kind === "delay")
    return `${Number(node.config.duration_ms ?? 0).toLocaleString()} ms 대기`;
  if (node.kind === "condition") {
    const operator =
      {
        eq: "=",
        ne: "≠",
        gt: ">",
        gte: "≥",
        lt: "<",
        lte: "≤",
        exists: "존재 여부",
      }[String(node.config.operator)] ?? node.config.operator;
    return `${node.config.field ?? "field"} ${operator ?? "="} ${node.config.operator === "exists" ? "" : JSON.stringify(node.config.value ?? null)}`;
  }
  return node.config.fail
    ? "오류 재현 설정이 켜져 있습니다"
    : `${node.config.field ?? "field"} → ${JSON.stringify(node.config.value ?? null)}`;
}

type FlowData = { node: WorkflowNode; status?: string } & Record<
  string,
  unknown
>;
type FlowNode = Node<FlowData, "workflowNode">;
function WorkflowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node;
  return (
    <div
      className={`workflow-node node-${node.kind}${selected ? " is-selected" : ""}${data.status ? ` node-status-${data.status}` : ""}`}
    >
      {node.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Top}
          id="in"
          aria-label={`${displayLabel(node.label)} 입력 연결점`}
        />
      )}
      <div className="workflow-node-top">
        <span className={`node-icon tone-${node.kind}`}>
          <Icon name={kindIcons[node.kind]} size={16} />
        </span>
        <span className="node-kind">{kindLabels[node.kind]}</span>
        {data.status && (
          <span
            className={`node-status-dot status-${data.status}`}
            title={data.status}
          />
        )}
        <span className="node-dots">•••</span>
      </div>
      <strong>{displayLabel(node.label)}</strong>
      <div className="node-description" title={nodeDescription(node)}>
        {nodeDescription(node)}
      </div>
      {node.kind === "condition" ? (
        <>
          <span className="branch-label branch-true">True</span>
          <span className="branch-label branch-false">False</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: "25%" }}
            aria-label={`${displayLabel(node.label)} True 연결점`}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: "75%" }}
            aria-label={`${displayLabel(node.label)} False 연결점`}
          />
        </>
      ) : (
        node.kind !== "output" && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="out"
            aria-label={`${displayLabel(node.label)} 출력 연결점`}
          />
        )
      )}
    </div>
  );
}
const nodeTypes = { workflowNode: WorkflowNodeCard };

export function WorkflowCanvas({
  workflow,
  selectedNode,
  onSelect,
  onChange,
  statuses,
  readOnly = false,
}: {
  workflow: Workflow;
  selectedNode?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (workflow: Workflow) => void;
  statuses?: Record<string, string>;
  readOnly?: boolean;
}) {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const nodes = useMemo<FlowNode[]>(
    () =>
      workflow.nodes.map((node) => ({
        id: node.id,
        type: "workflowNode",
        data: { node, status: statuses?.[node.id] },
        position: node.position,
        selected: node.id === selectedNode,
      })),
    [workflow.nodes, statuses, selectedNode],
  );
  const edges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdge,
        sourceHandle: edge.branch ?? "out",
        targetHandle: "in",
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color:
            edge.branch === "true"
              ? "#5baf99"
              : edge.branch === "false"
                ? "#897bab"
                : "#566473",
        },
        style: {
          stroke:
            edge.branch === "true"
              ? "#5baf9977"
              : edge.branch === "false"
                ? "#897bab77"
                : "#566473",
          strokeWidth: 1.5,
        },
        label: undefined,
        animated: statuses?.[edge.source] === "waiting",
      })),
    [workflow.edges, statuses, selectedEdge],
  );
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    if (!onChange || readOnly) return;
    const meaningful = changes.filter(
      (change) => change.type === "position" || change.type === "remove",
    );
    if (!meaningful.length) return;
    const next = applyNodeChanges<FlowNode>(meaningful, nodes);
    const ids = new Set(next.map((node) => node.id));
    onChange({
      ...workflow,
      nodes: next.map((node) => ({
        ...node.data.node,
        position: node.position,
      })),
      edges: workflow.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    });
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (!onChange || readOnly) return;
    for (const change of changes) {
      if (change.type === "select" && change.selected) {
        setSelectedEdge(change.id);
        onSelect?.(null);
      }
      if (change.type === "select" && !change.selected)
        setSelectedEdge((previous) =>
          previous === change.id ? null : previous,
        );
    }
    if (!changes.some((change) => change.type === "remove")) return;
    const ids = new Set(
      applyEdgeChanges(changes, edges).map((edge) => edge.id),
    );
    onChange({
      ...workflow,
      edges: workflow.edges.filter((edge) => ids.has(edge.id)),
    });
  };
  const onConnect = (connection: Connection) => {
    if (!onChange || !connection.source || !connection.target) return;
    const branch =
      connection.sourceHandle === "true" || connection.sourceHandle === "false"
        ? connection.sourceHandle
        : undefined;
    onChange({
      ...workflow,
      edges: [
        ...workflow.edges,
        {
          id: `edge-${Date.now()}-${workflow.edges.length}`,
          source: connection.source,
          target: connection.target,
          ...(branch ? { branch } : {}),
        },
      ],
    });
  };
  return (
    <ReactFlow
      ariaLabelConfig={canvasLabels}
      key={`${workflow.id}-${workflow.nodes.length}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => {
        setSelectedEdge(null);
        onSelect?.(node.id);
      }}
      onEdgeClick={(_, edge) => {
        setSelectedEdge(edge.id);
        onSelect?.(null);
      }}
      onPaneClick={() => {
        setSelectedEdge(null);
        onSelect?.(null);
      }}
      fitView
      fitViewOptions={{ padding: 0.12, minZoom: 0.85, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.8}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      colorMode="dark"
      isValidConnection={(connection) =>
        connection.source !== connection.target
      }
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="#36404a"
      />
      <Controls showInteractive={false} />
      {!readOnly && (
        <MiniMap
          position="bottom-right"
          nodeColor={(node) =>
            node.data?.node
              ? {
                  trigger: "#5aab92",
                  transform: "#668fb4",
                  condition: "#b69b5e",
                  delay: "#9582c0",
                  output: "#639b8d",
                }[(node.data.node as WorkflowNode).kind]
              : "#789"
          }
          maskColor="#11171ee0"
          style={{ width: 125, height: 80 }}
        />
      )}
    </ReactFlow>
  );
}

interface StudioProps {
  workflow: Workflow;
  onWorkflow: (workflow: Workflow) => void;
  input: string;
  onInput: (input: string) => void;
  validation: Validation | null;
  onValidate: () => void;
  onTemplate: (id: string) => void;
  onResetWorkflow: () => void;
  inputError: string | null;
  saveStatus: string;
}

export function Studio({
  workflow,
  onWorkflow,
  input,
  onInput,
  validation,
  onValidate,
  onTemplate,
  onResetWorkflow,
  inputError,
  saveStatus,
}: StudioProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [config, setConfig] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const selectedNode = workflow.nodes.find((node) => node.id === selected);
  useEffect(() => {
    setConfig(selectedNode ? json(selectedNode.config) : "");
    setConfigError(null);
  }, [selectedNode?.id, selectedNode?.config]);
  useEffect(() => {
    if (!workflow.nodes.some((node) => node.id === selected)) setSelected(null);
  }, [workflow, selected]);
  const updateNode = (patch: Partial<WorkflowNode>) =>
    onWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === selected ? { ...node, ...patch } : node,
      ),
    });
  const applyConfig = () => {
    try {
      const value: unknown = JSON.parse(config);
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error("노드 설정은 JSON 객체여야 합니다.");
      updateNode({ config: value as WorkflowNode["config"] });
      setConfigError(null);
    } catch (error) {
      setConfigError(
        errorText(error instanceof Error ? error.message : String(error)),
      );
    }
  };
  const addNode = (kind: NodeKind) => {
    if (workflow.nodes.length >= 64) return;
    const id = `${kind}-${Date.now()}`;
    const node: WorkflowNode = {
      id,
      kind,
      label: `새 ${kindLabels[kind]}`,
      config: defaultConfig(kind),
      position: { x: 800, y: Math.min(workflow.nodes.length * 45, 550) },
    };
    onWorkflow({ ...workflow, nodes: [...workflow.nodes, node] });
    setSelected(id);
  };
  const removeNode = () => {
    onWorkflow({
      ...workflow,
      nodes: workflow.nodes.filter((node) => node.id !== selected),
      edges: workflow.edges.filter(
        (edge) => edge.source !== selected && edge.target !== selected,
      ),
    });
    setSelected(null);
  };
  return (
    <div className="studio-layout">
      <aside className="studio-sidebar">
        <div className="sidebar-section">
          <div className="section-overline">
            작업 공간 <span className="tiny-tag">로컬</span>
          </div>
          <div className="workspace-heading">
            <span className="workspace-avatar">F</span>
            <div>
              <strong>내 Workflow</strong>
              <small>이 브라우저에 저장됩니다</small>
            </div>
          </div>
        </div>
        <div className="sidebar-section templates-section">
          <div className="section-overline">
            템플릿 선택 <span>{templates.length}</span>
          </div>
          <div className="template-list">
            {templates.map((template, index) => (
              <button
                className={`template-button ${workflow.id === template.id ? "active" : ""}`}
                key={template.id}
                onClick={() => {
                  onTemplate(template.id);
                  setSelected(null);
                }}
                aria-label={template.name}
              >
                <span className="template-icon">
                  <Icon
                    name={
                      index === 0
                        ? "branch"
                        : index === 1
                          ? "activity"
                          : "layers"
                    }
                    size={17}
                  />
                </span>
                <span>
                  {template.name}
                  <small>노드 {template.workflow.nodes.length}개</small>
                </span>
                {workflow.id === template.id && (
                  <span className="active-marker" />
                )}
              </button>
            ))}
          </div>
        </div>
        <details className="sidebar-section node-library-section">
          <summary>노드 추가</summary>
          <p className="sidebar-description">필요한 처리 단계를 추가합니다.</p>
          <div className="node-library">
            {(
              [
                "trigger",
                "transform",
                "condition",
                "delay",
                "output",
              ] as NodeKind[]
            ).map((kind) => (
              <button
                key={kind}
                onClick={() => addNode(kind)}
                className="library-button"
                aria-label={`${kindLabels[kind]} 노드 추가`}
                disabled={workflow.nodes.length >= 64}
              >
                <span className={`library-icon tone-${kind}`}>
                  <Icon name={kindIcons[kind]} size={16} />
                </span>
                <span>{kindLabels[kind]}</span>
                <Icon name="plus" size={13} />
              </button>
            ))}
          </div>
        </details>
        <div className="sidebar-bottom">
          <div className="engine-mini">
            <span className="status-light" />
            <div>
              <strong>브라우저에서 바로 실행</strong>
              <span>입력을 외부로 전송하지 않습니다.</span>
            </div>
          </div>
          <button className="text-button muted" onClick={onResetWorkflow}>
            <Icon name="reset" size={14} />
            템플릿으로 되돌리기
          </button>
        </div>
      </aside>
      <section className="canvas-section">
        <div className="canvas-toolbar">
          <div className="canvas-breadcrumb">
            <Icon name="workflow" size={16} />
            <span>Workflow</span>
            <Icon name="chevron" size={11} />
            <strong>{displayLabel(workflow.name)}</strong>
          </div>
          <div className="canvas-toolbar-right">
            <span className="save-status">
              <Icon name="check" size={13} />
              {saveStatus}
            </span>
            <button
              className="button button-small button-ghost"
              onClick={onValidate}
            >
              <Icon name="check" size={14} />
              검증하기
            </button>
          </div>
        </div>
        <div className="workflow-canvas" data-testid="workflow-canvas">
          <WorkflowCanvas
            workflow={workflow}
            selectedNode={selected}
            onSelect={setSelected}
            onChange={onWorkflow}
          />
          <div className="canvas-label">
            <span className="status-light" />
            <span>실행할 Workflow</span>
          </div>
        </div>
        <div className="canvas-status">
          <span>
            <span className="small-dot" />
            노드 {workflow.nodes.length}개{" "}
            <span className="dot-separator">·</span>
            연결 {workflow.edges.length}개
          </span>
          <span>그래프 드래그 · +/−로 확대·축소</span>
        </div>
        {validation && !validation.valid && (
          <div className="validation-errors" role="alert">
            <strong>
              <Icon name="info" size={15} />
              다음 항목을 수정한 뒤 실행하세요
            </strong>
            <ul>
              {validation.errors.map((error, i) => (
                <li key={`${i}-${error}`}>{errorText(error)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <aside className="inspector-sidebar">
        <div className="inspector-header">
          <div>
            <Icon name="code" size={16} />
            <strong>노드 설정</strong>
          </div>
          {selectedNode && (
            <button
              className="icon-button"
              aria-label="노드 설정 닫기"
              onClick={() => setSelected(null)}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <div className="inspector-scroll">
          {selectedNode ? (
            <div className="node-inspector">
              <div className="selected-node-heading">
                <span
                  className={`selected-node-icon tone-${selectedNode.kind}`}
                >
                  <Icon name={kindIcons[selectedNode.kind]} size={22} />
                </span>
                <div>
                  <h3>{displayLabel(selectedNode.label)}</h3>
                  <span>{kindDescriptions[selectedNode.kind]}</span>
                </div>
              </div>
              <label className="field-label" htmlFor="node-label">
                노드 이름
              </label>
              <input
                id="node-label"
                value={displayLabel(selectedNode.label)}
                maxLength={120}
                onChange={(event) => updateNode({ label: event.target.value })}
              />
              <div className="config-label">
                <label className="field-label" htmlFor="node-config">
                  설정
                </label>
                <span className="code-tag">JSON</span>
              </div>
              <textarea
                id="node-config"
                className="code-editor config-editor"
                value={config}
                onChange={(event) => setConfig(event.target.value)}
                spellCheck={false}
                aria-label="노드 설정 JSON"
              />
              {configError && (
                <p className="field-error" role="alert">
                  {errorText(configError)}
                </p>
              )}
              {selectedNode.kind === "condition" && (
                <p className="field-help">
                  field는 비교할 필드, value는 기준값입니다. gte는 이상, gt는
                  초과, eq는 같음을 뜻합니다.
                </p>
              )}
              {selectedNode.kind === "transform" && (
                <p className="field-help">
                  field에 지정한 필드를 value 값으로 바꿉니다. fail을 true로
                  설정하면 오류를 재현합니다.
                </p>
              )}
              {selectedNode.kind === "delay" && (
                <p className="field-help">
                  duration_ms는 기다릴 가상 시간입니다. 0~60,000 ms를
                  입력합니다.
                </p>
              )}
              <div className="inspector-actions">
                <button className="button button-small" onClick={applyConfig}>
                  <Icon name="check" size={14} />
                  설정 적용
                </button>
                <button
                  className="icon-button danger-hover"
                  onClick={removeNode}
                  aria-label="선택한 노드 삭제"
                  title="선택한 노드 삭제"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="node-id">
                노드 ID <code>{selectedNode.id}</code>
              </div>
            </div>
          ) : (
            <div className="inspector-placeholder">
              <Icon name="search" size={25} />
              <h3>먼저 실행해 보세요</h3>
              <p>
                준비된 입력으로 바로 실행할 수 있습니다. 처리 규칙을 바꾸려면
                그래프에서 노드를 선택하세요.
              </p>
              <label className="field-label" htmlFor="workflow-name">
                Workflow 이름
              </label>
              <input
                id="workflow-name"
                value={displayLabel(workflow.name)}
                maxLength={120}
                onChange={(event) =>
                  onWorkflow({ ...workflow, name: event.target.value })
                }
              />
            </div>
          )}
          <div className="input-section">
            <div className="input-section-heading">
              <strong>
                <Icon name="bolt" size={16} />
                입력 데이터
              </strong>
              <span className="code-tag">JSON</span>
            </div>
            <p>
              다음 Run에 전달할 데이터입니다. 처음에는 그대로 실행해도 됩니다.
            </p>
            <textarea
              className="code-editor input-editor"
              value={input}
              onChange={(event) => onInput(event.target.value)}
              aria-label="입력 데이터 JSON"
              spellCheck={false}
            />
            {inputError ? (
              <p className="field-error" role="alert">
                {inputError}
              </p>
            ) : (
              <div className="input-valid">
                <Icon name="check" size={12} />
                사용 가능한 JSON
              </div>
            )}
          </div>
        </div>
        <div className="inspector-footer">
          {validation?.valid ? (
            <Badge tone="completed">실행 가능</Badge>
          ) : (
            <Badge tone="neutral">
              {validation ? "검증 결과 확인" : "검증 대기"}
            </Badge>
          )}
          <span>v1.0</span>
        </div>
      </aside>
    </div>
  );
}
