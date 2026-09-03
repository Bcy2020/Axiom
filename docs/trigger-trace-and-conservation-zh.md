# Acceptance-Driven V2 修订方向（触发连线 + 双守恒 + 增量编译）

> 定位：现有 skill + MCP（v0.1）已完成"触发→反馈树 + 块图 + 编译 + 查看"。本文件记录 **V2 修订方向**——把"全局状态源、接口守恒、触发连线(TriggerTrace)、增量编译"补进闭环。方向与 5 个决策点**已经用户确认**，待落地为代码与 skill。
>
> 关联：schema 设计 `docs/schema-design-acceptance-driven-zh.md`；方向变换 `docs/acceptance-driven-direction-change-zh.md`；理论依据 `docs/Tree-Centered Implementation Refinement-zh.md`（全局状态守恒）、`docs/recursive-decomposition-zh.md`（接口保持证明）。

---

## 1. 已确认决策（用户批准）

1. **保留两个层次**：`TriggerFeedbackTree`（应当行为树：正常 + 各故障反馈）与 `TriggerTrace`（触发→块连线：哪个块实现 + effect + 数据源变更 + 分支）**分离保留，不合并**。
2. **废弃 `covered_flow_nodes`**：块不再声明"覆盖哪些路径"；改由 trace 反向得出（某触发串到哪些块 / 某块被哪些触发串到）。
3. **确认触发是入口锚对象**：不进核心块图、不被实现；仅作为对象记录，用于"触发连线"与"分解自查"。
4. **双守恒分开**：**接口守恒**只管接口集合（`ports` in/out + `deps` 暴露）；**全局状态守恒**只管数据源操作（`data_operations`）。两者各自独立校验。
5. **effect 为自由文本**：触发-块连线上的效果标注按当前块粒度粗写（如"产生 log / 写入某文件 / 引箭头指向某数据源并改变它"），不做强 schema 约束。

---

## 2. 保留（现有契合，不动）

- **触发成为独立对象**（`record_trigger`，不进 blocks）。
- **应当反馈树**：`TriggerFeedbackTree` / `FeedbackNode`（decision_point / action / feedback_leaf，feedback_type: success|business_fail|system_error|degraded，guard_condition，branches）。
- **块 + 接口串接**：`propose_block` / `record_port` / `connect_dependency`（`ports` in/out + contract，`deps`）。
- **traceability `source`**（SourceRef：ac/fr/trigger/flow_node/derived）。
- 查看工具：`query_flow_tree` / `query_block` / `list_*`。

---

## 3. 改动 A — 数据模型（`schema.ts`）

```ts
// 全局状态源（空图分解前置定义）
export interface DataSource {
  id: string; name: string;
  category: "db" | "input" | "fs" | "external" | "cache";
  access_mode: "read" | "write" | "read_write";
  entities: string[]; operations: string[];
}

// 块声明它对各数据源的操作（供全局状态守恒）
export interface BlockDataOperation { data_source_id: string; access_mode: "read" | "write" | "read_write"; }
// FunctionalBlock 增加: data_operations: BlockDataOperation[];

// 触发→块连线（以触发为主轴；effect 归属触发对象）
export interface TriggerTrace {
  id: string;
  trigger_id: string;
  target_block_id: string;
  effect: string;                    // 按块粒度粗写的效果标注
  data_source_effects: string[];     // 指向的数据源变更（如 "写 logs.db"）
  branch: "normal" | "error-1" | "error-2";  // 串出两条（错误处理）
  parent_trace_id?: string;          // 串径分层（上层 trace -> 这层）
}
```

**改动**：`FunctionalBlock` **废除 `covered_flow_nodes`**（保留字段改为 deprecated 或删除）。新增 `DataSource`、`data_operations`、`TriggerTrace`。

---

## 4. 改动 B — 编译（双守恒不变量）

新增两条确定性校验（`compile_block_graph`）：

- **接口守恒**：父块外部接口（它暴露的 `ports` in/out + `deps` 对外接口）应被子块外部接口**不多不少**覆盖。
  - `uncovered`（子有父无 → 子接口冗余/父缺）与 `overreached`（父有子无 → 接口泄漏/子未覆盖）都必须报错。
- **全局状态守恒**：父块 `data_operations` = Σ(子块 `data_operations`)；且每块只操作**已声明的 DataSource**（操作未声明源 = 越权）。

> 这两条就是你说"Agent 不一定一次符合守恒"的兜底：用确定性校验兜住，而非让 Agent 自觉。

---

## 5. 改动 C — 工具（`tools.ts` / `server.ts`）

| 工具 | 作用 |
|---|---|
| `record_data_source` / `list_data_sources` | 记录/列出全局状态源 |
| `record_trigger_trace` | 记录触发→块连线（effect 属触发对象，含 branch + parent_trace_id） |
| `query_trigger_trace` | 从某触发**展开成调用树**（触发→块→子块→数据源变更，含 error 分支）——**分解自查**手段 |
| `compile_block_graph` | 支持**局部编译**（指定 block_id/子树），配合草稿 |
| `promote_*` / `commit_snapshot` | 恢复 **draft→compile→promote→snapshot** 状态机（增量编译：做一部分、编译、promote 加入、再做下一部分） |

---

## 6. 改动 D — skill 流程重排

1. **评估 + 技术栈**（读 PRD 后先给）。
2. **全局状态源**：`record_data_source`（含 API）。
3. **列触发**：`record_trigger`。
4. **顶层块 + 接口**：`propose_block` / `record_port` / `connect_dependency`。
5. **触发连线**：`record_trigger_trace`（触发→块 + 按粒度 effect + 数据源变更 + 分支）。
6. **下一层**：分层往下，已连块的块再分解，trace 跟着细化。
7. **增量编译**：做一部分、编译一部分、promote、再做下一部分。
8. **自查**：`query_trigger_trace` 拉出触发调用树核对。

---

## 7. 落地顺序

1. schema 扩展：`DataSource` / `data_operations` / `TriggerTrace`，废除 `covered_flow_nodes`。
2. 编译双守恒不变量（接口守恒、全局状态守恒）。
3. 工具：`record_data_source` / `record_trigger_trace` / `query_trigger_trace` / 局部编译 + draft/promote 状态机。
4. skill 重排（含评估+技术栈、状态源、触发连线、增量编译、自查）。
5. 用 `E:\repos\test_3D\20260822-v4f\docs\PRD.md` 真实分解验证，迭代。

---

## 8. 一致性提示

- **触发是入口锚**（决策 3）：不进块图，故不参与接口守恒；只在 trace 连线与自查处出现。
- **双守恒分开**（决策 4）：接口守恒在"块-块接口集合"层，全局状态守恒在"块-数据源操作"层。
- **effect 属触发对象**：同一块被多个触发串到，effect 可各自不同（决策 5）。
- **V2 不重做 v0.1**：保留应当行为树 + 块图 + source traceability，仅补三条主轴。
