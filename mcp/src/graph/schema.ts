/**
 * Acceptance-Driven MCP v0.1 — Data Model Types (Forward Direction)
 * Schema design: docs/schema-design-acceptance-driven-zh.md
 * Derives a layered functional-block graph from PRD acceptance criteria.
 * Anchored on SourceRef (AC/FR/trigger/flow-node) instead of code entity + evidence.
 */

// ── SourceRef: traceability anchor ───────────────────────────────────────────
export type SourceRef =
  | { kind: "ac"; ac_id: string }
  | { kind: "fr"; fr_id: string }
  | { kind: "trigger"; trigger_id: string }
  | { kind: "flow_node"; node_id: string }
  | { kind: "derived"; from: SourceRef[]; reason: string };

export function sourceRefToString(s: SourceRef | string): string {
  // Defensive: if a double-encoded string (JSON of a SourceRef) reaches us,
  // parse it back so `s.kind` is readable. If it can't be parsed, treat as
  // untraceable. Prevents a stored-string from silently triggering NO_SOURCE.
  let ref: SourceRef;
  if (typeof s === "string") {
    try { ref = JSON.parse(s) as SourceRef; } catch { return ""; }
  } else {
    ref = s;
  }
  switch (ref.kind) {
    case "ac": return `ac:${ref.ac_id}`;
    case "fr": return `fr:${ref.fr_id}`;
    case "trigger": return `trigger:${ref.trigger_id}`;
    case "flow_node": return `flow_node:${ref.node_id}`;
    case "derived": return `derived(${ref.from.map(sourceRefToString).join("+")})`;
    default: return "";
  }
}

// ── Trigger ──────────────────────────────────────────────────────────────────
export interface Trigger {
  id: string;
  name: string;
  command?: string;
  precondition?: string;
  source: SourceRef;
}

// ── Trigger → Feedback Tree (branching) ──────────────────────────────────────
export type FeedbackNodeType = "decision_point" | "action" | "feedback_leaf";
export type FeedbackType = "success" | "business_fail" | "system_error" | "degraded";

export interface FeedbackNode {
  id: string;
  type: FeedbackNodeType;
  guard_condition?: string;      // decision_point 分叉条件
  branches?: FeedbackNode[];     // 正常主干 + 各故障/失败/降级路径（递归）
  action?: string;               // action 节点：这一步做什么
  feedback_type?: FeedbackType;  // feedback_leaf：成功/业务失败/系统错误/降级
  message?: string;              // 反馈内容/效果
  source: SourceRef;
}

export interface TriggerFeedbackTree {
  id: string;
  trigger_id: string;
  root: FeedbackNode;
  source: SourceRef;
}

// Convenience: walk the tree, collect every FeedbackNode id.
export function collectFeedbackNodeIds(root: FeedbackNode): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n.id);
    if (n.branches) for (const b of n.branches) stack.push(b);
  }
  return out;
}

// ── Functional Block (layered aggregation) ───────────────────────────────────
export type BlockStatus = "draft" | "accepted" | "stale" | "disputed";

export interface FieldSpec {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  default?: string;
  constraints?: string;
}

export interface OutputSpec {
  type: string;
  description: string;
  structure?: string;
}

export interface FunctionSpec {
  inputs: FieldSpec[];
  outputs: OutputSpec;
  preconditions: string[];
  postconditions: string[];
  invariants: string[];
  side_effects?: string;
  error_handling: Partial<Record<FeedbackType, string>>;
}

export interface Boundary {
  in_scope: string[];
  out_of_scope: string[];   // = parent_guarantees / non_responsibilities
}

export interface Port {
  id: string;
  block_id: string;
  name: string;
  direction: "in" | "out";
  contract: string;
  /** External (parent-facing, participates in interface conservation) vs internal (child-child, hidden from parent). Defaults to "external". */
  scope?: "external" | "internal";
}

export interface Dependency {
  id: string;
  source_block_id: string;
  target_block_id: string;
  via_port?: string;
  protocol: string;
  source: SourceRef;
}

export interface FunctionalBlock {
  id: string;
  name: string;
  purpose: string;
  parent_id: string | null;
  function_spec: FunctionSpec;
  boundary: Boundary;
  ports: Port[];
  deps: Dependency[];
  /** Block's declared operations on global state sources (V2: global-state conservation). */
  data_operations: BlockDataOperation[];
  source: SourceRef;
  status: BlockStatus;
}

// ── V2: Global state sources + trigger-trace (trigger → block edges) ─────────
export type DataSourceCategory = "db" | "input" | "fs" | "external" | "cache";
export type AccessMode = "read" | "write" | "read_write";

/** A global state source (defined up-front in empty-graph decomposition). */
export interface DataSource {
  id: string;
  name: string;
  category: DataSourceCategory;
  access_mode: AccessMode;
  entities: string[];
  operations: string[];
}

/** A block's declaration of what it does to a data source. */
export interface BlockDataOperation {
  data_source_id: string;
  access_mode: AccessMode;
}

/** Trigger → block edge (trace, keyed on trigger; effect belongs to the trigger object). */
export interface TriggerTrace {
  id: string;
  trigger_id: string;
  target_block_id: string;
  effect: string;                 // coarse-grained effect annotation at block granularity
  data_source_effects: string[];  // data-source changes this edge causes (e.g. "write logs.db")
  branch: string;                 // "normal" | "error-1" | "error-2" ...
  parent_trace_id?: string;       // nested trace linkage (upper trace -> this layer)
}

// ── Diagnostic / envelope (shared across tools) ──────────────────────────────
export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  message: string;
  entity_id?: string;
  severity: DiagnosticSeverity;
  suggested_fix?: string;
}

export interface ToolResponse<T = unknown> {
  ok: boolean;
  data?: T;
  errors?: Diagnostic[];
  warnings?: Diagnostic[];
}
