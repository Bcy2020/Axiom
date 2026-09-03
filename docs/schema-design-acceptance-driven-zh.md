# Acceptance-Driven 正向图层 — 第一轮 Schema 设计

> 状态：设计审查稿。本文件定义"验收驱动结构推导"第一轮落地的数据模型（Schema）。
> 用途：作为**复制 `kuang-tu_MCP`（blockgraph-mcp）并剥离逆向属性**后改写的依据；第一轮只打通分解流程，**不含**批注反馈、绑定真实代码。
>
> 前置：方向说明见 `docs/acceptance-driven-direction-change-zh.md`（本 schema 是其第 7 节的落）。参考：`kuang-tu_MCP/src/graph/schema.ts`（逆向版，尽量复用其字段风格）。

---

## 1. 定位与设计原则

正向图层 = 从 **PRD 验收要求**出发，推导出**应当行为树（触发→反馈树）**，再**聚合**为**分层功能块图**。它与 BlockGraph 的逆向（从已有代码反推）**锚点相反**：

| | BlockGraph（逆向） | 本图层（正向） |
|---|---|---|
| 锚点 | `code_entity_id` + `evidence`(file/line) | `SourceRef` → AC/FR/触发/流程节点 |
| 目标 | 维护已有仓库的架构模型 | 从需求生成结构，供实现 |
| 结构来源 | 代码扫描 | 验收触发 → 应当行为树 → 聚合 |

**核心设计原则**：
1. **traceability 优先**：每个对象挂 `source`（`SourceRef`），可追溯到验收/需求。这是防过度防御的不变量。
2. **行为树是"应当"**：`TriggerFeedbackTree` 枚举"每种应当情况下该给什么反馈"，含正常主干 + 各故障/失败/降级分支。
3. **聚合分层、非逐步骤**：`FunctionalBlock` 聚合多条路径（`covered_flow_nodes` 为集合），粒度由聚合层内聚度决定，**不是**每个流程步骤一块。
4. **不变量是边界，不是答案**：validator 只判"合法"（见 §4），不判"分解正确"。

---

## 2. 从 BlockGraph 剥离的逆向属性（不复用）

第一轮不复用/剥离以下（属于逆向、锚代码、与正向无关）：

- `CodeEntity` / `CodeEdge`（file/function/class/route/...、imports/calls/renders/handles_event/fetches）
- `Evidence`（`file_path`/`start_line`/`end_line`/`code_entity_id`）→ 正向用 `SourceRef` 取代
- `BlockCodeMapping`、`Code Fact Graph`、`scanner/tsScanner.ts`
- Work Package 的 `scope_paths`/`included_entity_ids`（路径/代码锚）→ 正向用功能/触发语义取代
- 逆向流的 `entrypoint_entity_id` 依赖代码实体 → 正向 `Trigger` 取代

---

## 3. 正向图层核心对象（TS 类型草案）

### 3.0 来源锚 `SourceRef`（traceability 通用）

```ts
export type SourceRef =
  | { kind: "ac"; ac_id: string }                       // 一条验收标准
  | { kind: "fr"; fr_id: string }                       // 一条功能需求
  | { kind: "trigger"; trigger_id: string }             // 一个触发
  | { kind: "flow_node"; node_id: string }              // 触发→反馈树的一个节点
  | { kind: "derived"; from: SourceRef[]; reason: string }; // 聚合推导（多来源）
```

`derived` 用于聚合块：一个块聚合多条路径 → `source = derived([...flow_node])`。

### 3.1 触发 `Trigger`

```ts
export interface Trigger {
  id: string;                       // 如 "trigger.create_task"
  name: string;                     // 如 "create task"
  command?: string;                 // 来自 PRD.input_spec.command（如 "add"）
  precondition?: string;            // 前置条件
  source: SourceRef;                // ac / fr
}
```

### 3.2 触发→反馈树 `TriggerFeedbackTree` / `FeedbackNode`（分支核心）

```ts
export type FeedbackNodeType = "decision_point" | "action" | "feedback_leaf";
export type FeedbackType = "success" | "business_fail" | "system_error" | "degraded";

export interface FeedbackNode {
  id: string;                       // 树内唯一，如 "create_task.root.check_stock.leaf_invalid"
  type: FeedbackNodeType;
  guard_condition?: string;         // decision_point 分叉条件
  branches?: FeedbackNode[];        // 正常主干 + 各故障路径（递归）
  action?: string;                  // action 节点：这一步做什么
  feedback_type?: FeedbackType;     // feedback_leaf：成功/业务失败/系统错误/降级
  message?: string;                 // 反馈内容/效果
  source: SourceRef;                // traceability
}

export interface TriggerFeedbackTree {
  id: string;
  trigger_id: string;
  root: FeedbackNode;               // 递归树，含分支
  source: SourceRef;
}
```

> 这是 BlockGraph `FlowStep`（线性 order）的**升级**——支持分支。`action` 节点是功能行为点（后续可引用/聚合进 `FunctionalBlock`）；`feedback_leaf` 是"应当反馈"契约，直接对应"实现即验证"的验证基准。

### 3.3 功能块 `FunctionalBlock`（分层聚合）

```ts
export type BlockStatus = "draft" | "accepted" | "stale" | "disputed";  // 复用 BlockGraph

export interface FunctionalBlock {
  id: string;                       // 如 "block.create_task"
  name: string;                     // snake_case
  purpose: string;
  parent_id: string | null;         // 分层（聚合层）
  function_spec: FunctionSpec;      // 契约
  boundary: Boundary;               // = parent_guarantees / non_responsibilities
  ports: Port[];                    // 边界接口
  deps: Dependency[];               // 块间依赖
  covered_flow_nodes: string[];     // 聚合引用的 FeedbackNode id（action + feedback_leaf）【集合，一块多路径】
  source: SourceRef;                // traceability（聚合时多为 derived）
  status: BlockStatus;
}
```

```ts
export interface FunctionSpec {
  inputs: { name: string; type: string; description: string;
            required?: boolean; default?: string; constraints?: string }[];
  outputs: { type: string; description: string; structure?: string }[];
  preconditions: string[];
  postconditions: string[];
  invariants: string[];
  side_effects?: string;
  error_handling: Partial<Record<FeedbackType, string>>;  // 对齐各故障 feedback_leaf
}
```

```ts
export interface Boundary {
  in_scope: string[];
  out_of_scope: string[];           // = parent_guarantees / non_responsibilities（信任父/兄弟已做）
}
```

```ts
export interface Port {
  id: string;
  name: string;
  direction: "in" | "out";
  contract: string;                 // Design-by-Contract
}

export interface Dependency {
  id: string;
  source_block_id: string;
  target_block_id: string;
  via_port?: string;
  protocol: string;                 // function_call | event | state | ...
  source: SourceRef;
}
```

### 3.4 图（跨块依赖 DAG）

`FunctionalBlock` + `Port` + `Dependency` 构成**有向无环图**。多个块共享同一底层块（复用）→ `Dependency` 多入边；`parent_id` 提供**分层**（上层块聚合底层块）。这取代了 node_schema 的 `children` 递归树。

---

## 4. 确定性不变量（validator 红线，唯一应写成确定规则的部分）

这是"先修不变量 enforcement"的落点。`compile`（编译门）校验以下**合法性**，不判"分解对错"：

1. **traceability**：每个 `FunctionalBlock` / `FeedbackNode` 有 `source`；无 `source`（且非 derived）视为过度防御/凭空想象 → 拒绝。
2. **引用完整性**：`covered_flow_nodes` 引用的 `FeedbackNode` 存在；`Dependency` 引用的 block 存在。
3. **职责合法**：`boundary.in_scope` 未包含父块 `boundary.out_of_scope` 明确排除的内容（未越权新增职责）。
4. **资源边界**：块所需 input/资源在其父 boundary 或已声明 deps/ports 之内，未自行扩权。
5. **接口可绑定**：`Port` 的 in 有来源（被上游 deps 或父提供），out 被消费（下游/外部接口），数据流一致。
6. **图无环**：可拓扑排序（环是责任边界切错的信号）。

> 对应方向文档 §5 的 5 条红线：职责合法、资源边界足够且不越界、接口可绑、图无环、traceability。

---

## 5. 与 BlockGraph 的复用 / 剥离 / 新增映射

| 类别 | 复用（保留） | 剥离（逆向） | 新增（正向） |
|---|---|---|---|
| **类型** | `BlockStatus`/`FlowStatus` enum、`Port`(direction/contract)、`Connector→Dependency`、`Diagnostic`、`ToolResponse` | `CodeEntity`/`CodeEdge`/`Evidence`/`BlockCodeMapping`/`UnknownBoundary(code_entity)` | `SourceRef`/`Trigger`/`TriggerFeedbackTree`/`FeedbackNode`/`FunctionalBlock`/`FunctionSpec`/`Boundary` |
| **存储** | SQLite store 模式（better-sqlite3、WAL、表）、`draft→compile→promote→snapshot` 状态机 | 代码锚定的表、scanner | 正向表（triggers / flow_trees / feedback_nodes / blocks / ports / deps） |
| **MCP 工具** | `server.registerTool` 模式、tool handler 签名 | 逆向工具（`scan_repo`/`attach_code_entity`/`create_flow`(线性)/...） | 正向工具（见 §6） |
| **治理** | 质量门、多代理隔离评审（可后续用于聚合/评审） | — | traceability 门（§4） |

---

## 6. 第一轮 MCP 工具清单

第一轮只打通**分解流程**，工具范围（不含批注/绑定真实代码）：

| 工具 | 作用 |
|---|---|
| `begin_initialization` | 创建/恢复会话，返回 db_path + 图摘要 |
| `record_trigger` | 从 AC/FR 记录一个触发 |
| `record_flow_tree` | 记录一个 `TriggerFeedbackTree`（含分支 + source） |
| `propose_block` | 从树聚合/提炼一个 `FunctionalBlock`（含 covered_flow_nodes + source） |
| `record_port` / `connect_dependency` | 记录块端口 / 块间依赖 |
| `compile_block_graph` | 校验 §4 不变量（合法/拒绝），返回 diagnostic |
| `query_flow_tree` / `query_block` | **查看工具**：返回树/块全貌（供 agent 对照） |

> 用户要求第一轮完成后：能**真实完整分解** + 一个 agent 用查看工具(`query_flow_tree`/`query_block`)查看对照完成。批注、绑定真实代码不做（留后续轮）。

---

## 7. 已确认决策（用户批准）

- [x] `FeedbackNode.action` 节点**允许被 `FunctionalBlock` 直接引用**（`covered_flow_nodes` 可含 action + feedback_leaf 节点 id）。
- [x] `covered_flow_nodes` 引用 FeedbackNode id（路径端）即可，**无需显式 `FlowPath` 对象**。
- [x] **要求聚合**：第一轮由结构代理用 `propose_block` 从树聚合出 `FunctionalBlock`，是必做步骤，不是可选。

---

> 下一节点：你（用户）审查本 schema 并给出 7 项决策；批准后我**复制 `kuang-tu_MCP` → 剥离逆向属性 → 按本 schema 改写 store/draft/compiler/tools → 注册 MCP**，跑一次真实 PRD 分解验证可行性。
