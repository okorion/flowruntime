//! Workflow snapshots and structural/config validation.
use crate::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub config: Value,
    pub position: Position,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
}

pub(crate) fn text_ok(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 256
}
pub(crate) fn encoded_len(value: &impl Serialize) -> usize {
    serde_json::to_vec(value)
        .map(|v| v.len())
        .unwrap_or(usize::MAX)
}
pub(crate) fn check_payload(value: &Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("Input and transformed values must be JSON objects".into());
    }
    if encoded_len(value) > MAX_PAYLOAD {
        return Err(format!("Payload exceeds {MAX_PAYLOAD} bytes"));
    }
    Ok(())
}

pub fn validate(workflow: &Workflow) -> Vec<String> {
    let mut errors = Vec::new();
    if !text_ok(&workflow.id) || !text_ok(&workflow.name) {
        errors.push("Workflow id/name must be nonempty and at most 256 bytes".into());
    }
    if workflow.nodes.is_empty() || workflow.nodes.len() > MAX_NODES {
        errors.push("Workflow requires 1–64 nodes".into());
    }
    if workflow.edges.len() > 128 {
        errors.push("Workflow allows at most 128 edges".into());
    }
    if encoded_len(workflow) > MAX_WORKFLOW {
        errors.push("Workflow exceeds 128 KiB".into());
    }
    let mut ids = BTreeSet::new();
    let mut edge_ids = BTreeSet::new();
    let mut triggers = Vec::new();
    for node in &workflow.nodes {
        if !text_ok(&node.id) || !text_ok(&node.label) || !ids.insert(node.id.as_str()) {
            errors.push(format!("Invalid or duplicate node id/label: {}", node.id));
        }
        if !node.position.x.is_finite() || !node.position.y.is_finite() {
            errors.push(format!("Invalid position: {}", node.id));
        }
        if !node.config.is_object() {
            errors.push(format!("{} config must be an object", node.id));
            continue;
        }
        match node.kind.as_str() {
            "trigger" => {
                triggers.push(node.id.as_str());
            }
            "output" => {}
            "transform" => {
                if !node
                    .config
                    .get("field")
                    .and_then(Value::as_str)
                    .map(text_ok)
                    .unwrap_or(false)
                    || node.config.get("value").is_none()
                {
                    errors.push(format!("{} transform requires field and value", node.id));
                }
                if node.config.get("fail").is_some_and(|v| !v.is_boolean()) {
                    errors.push(format!("{} fail must be boolean", node.id));
                }
                if encoded_len(&node.config) > MAX_PAYLOAD {
                    errors.push(format!(
                        "{} transform config exceeds payload limit",
                        node.id
                    ));
                }
            }
            "condition" => {
                if !node
                    .config
                    .get("field")
                    .and_then(Value::as_str)
                    .map(text_ok)
                    .unwrap_or(false)
                {
                    errors.push(format!("{} condition requires field", node.id));
                }
                if !matches!(
                    node.config.get("operator").and_then(Value::as_str),
                    Some("eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "exists")
                ) {
                    errors.push(format!("{} condition operator is unsupported", node.id));
                }
                if node.config.get("operator").and_then(Value::as_str) != Some("exists")
                    && node.config.get("value").is_none()
                {
                    errors.push(format!("{} condition requires value", node.id));
                }
                if matches!(
                    node.config.get("operator").and_then(Value::as_str),
                    Some("gt" | "gte" | "lt" | "lte")
                ) && !node.config.get("value").is_some_and(Value::is_number)
                {
                    errors.push(format!(
                        "{} numeric comparison requires a numeric value",
                        node.id
                    ));
                }
            }
            "delay" => {
                if !node
                    .config
                    .get("duration_ms")
                    .and_then(Value::as_u64)
                    .is_some_and(|v| v <= 60_000)
                {
                    errors.push(format!(
                        "{} delay must be an integer from 0 to 60000 ms",
                        node.id
                    ));
                }
            }
            _ => errors.push(format!("{} has an unknown node kind", node.id)),
        }
    }
    if triggers.len() != 1 {
        errors.push("Workflow requires exactly one Trigger".into());
    }
    let mut incoming: BTreeMap<&str, usize> = BTreeMap::new();
    let mut outgoing: BTreeMap<&str, Vec<&WorkflowEdge>> = BTreeMap::new();
    for edge in &workflow.edges {
        if !text_ok(&edge.id) || !edge_ids.insert(edge.id.as_str()) {
            errors.push("Edge ids must be unique and nonempty".into());
        }
        if !ids.contains(edge.source.as_str()) || !ids.contains(edge.target.as_str()) {
            errors.push(format!("{} references a missing node", edge.id));
            continue;
        }
        *incoming.entry(&edge.target).or_default() += 1;
        outgoing.entry(&edge.source).or_default().push(edge);
    }
    for node in &workflow.nodes {
        let ins = incoming.get(node.id.as_str()).copied().unwrap_or(0);
        let outs = outgoing.get(node.id.as_str()).cloned().unwrap_or_default();
        if (node.kind == "trigger" && ins != 0) || (node.kind != "trigger" && ins != 1) {
            errors.push(format!(
                "{} must have {} incoming edge(s); joins are unsupported",
                node.id,
                if node.kind == "trigger" { 0 } else { 1 }
            ));
        }
        match node.kind.as_str() {
            "condition" => {
                if outs.len() != 2
                    || outs
                        .iter()
                        .filter(|e| e.branch.as_deref() == Some("true"))
                        .count()
                        != 1
                    || outs
                        .iter()
                        .filter(|e| e.branch.as_deref() == Some("false"))
                        .count()
                        != 1
                {
                    errors.push(format!(
                        "{} requires exactly one true and one false edge",
                        node.id
                    ));
                }
            }
            "output" => {
                if !outs.is_empty() {
                    errors.push(format!("{} Output cannot have outgoing edges", node.id));
                }
            }
            _ => {
                if outs.len() != 1 || outs.iter().any(|e| e.branch.is_some()) {
                    errors.push(format!(
                        "{} requires exactly one unlabelled outgoing edge",
                        node.id
                    ));
                }
            }
        }
    }
    let mut degrees = incoming.clone();
    let mut queue: VecDeque<&str> = ids
        .iter()
        .copied()
        .filter(|id| degrees.get(id).copied().unwrap_or(0) == 0)
        .collect();
    let mut visited = 0;
    while let Some(id) = queue.pop_front() {
        visited += 1;
        for edge in outgoing.get(id).into_iter().flatten() {
            if let Some(degree) = degrees.get_mut(edge.target.as_str()) {
                *degree = degree.saturating_sub(1);
                if *degree == 0 {
                    queue.push_back(&edge.target);
                }
            }
        }
    }
    if visited != ids.len() {
        errors.push("Workflow must be a DAG (cycles are unsupported)".into());
    }
    if let Some(trigger) = triggers.first() {
        let mut reached = BTreeSet::new();
        let mut stack = vec![*trigger];
        while let Some(id) = stack.pop() {
            if reached.insert(id) {
                for edge in outgoing.get(id).into_iter().flatten() {
                    stack.push(&edge.target);
                }
            }
        }
        if reached.len() != ids.len() {
            errors.push("All nodes must be reachable from the Trigger".into());
        }
    }
    errors
}
