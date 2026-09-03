# 方向变换：从树中心递归分解 → 验收驱动结构推导

> 本文件记录 Agent Chronos 2.0 的一次方向性调整：从"树中心、逐节点递归、海量 agent"转向"**少量分工代理 + 验收驱动结构推导**"。它明确列出哪些不变、哪些改变，并给出新架构与承载方式。
>
> 状态：方向已定，待落地为 skill + MCP。旧树中心 MVP 已归档。

---

## 1. 一句话

Agent Chronos 不再靠无限递归的树分解 + 每节点一个本地 agent 来"暴力拆清"项目。改由**少量分工代理**完成：

- **结构代理**从 PRD 的验收要求出发，展开"触发 → 反馈树"，再**聚合**成分层的功能块图（块 + 端口 + 连接器）；
- **实现代理**按块图实现，**实现即验证**，发现问题批注回流；
- 承载为 **BlockGraph MCP**（`kuang-tu_MCP`）的正向扩展图层。

---

## 2. 为什么转（动机）

### 2.1 完全细化让成本失控

逐节点递归 + 每节点多阶段（Stage1/2/3 + 叶子 codegen），对一颗 142 节点的树产生几百次串行 LLM 调用：

- **输入 token 膨胀**：每次调用都重发该节点的 TaskSpec + frozen children + dataflow edges，同节点多阶段重复序列化同一份 children；
- **前缀缓存命中率趋近零**：system prompt 大致同源，但 user prompt 一进入就按"节点 × 阶段"分叉，前缀在前面就断裂，之后全部 miss；
- **周期拉长**：串行调用叠加，wall-clock 变长。

### 2.2 上层失真

父节点分解时只看见它自己的输入/约束/目标，**无法预知下层真正需要什么**。于是下层的合理需求被系统性误判为违规：

- 职责层 `DEFENSIVE_OVERREACH`（下层想加检查 → 判违规）
- 资源层 `RESOURCE_BOUNDARY_UNDERALLOCATION`（下层缺 read → 判违规）
- 接口层 `INTERFACE_SELECTION_GAP`（下层选不到接口 → 判违规）

这"三层耦合"问题（hot.md 已记录）实为**同一根因**：上层失真 + 无回流通道，把"表达需要"当成异常。

### 2.3 单相静态模型装不下交流

"父定一切 + 子互不感知 + one-shot top-down"无法表达协同开发真正需要的：下层的观察要能回流、改变上层决策。一旦要考虑 agent 交流，单相静态分解方向不可行。

### 2.4 分解本身没有正确答案

同一组流程存在**多个合理性相当**的块划分，都不收敛到唯一解。因此：

- **不可写死"聚合规则"**（那就变成在无唯一解处强行造一个"正确答案"，属模式枚举/过拟合的另一种形态）；
- **不变量是"边界"，不是"答案"**：validator 只判"合法"，评审判"合理"。

> 这三条与 hot.md 一贯原则一致：先修不变量 enforcement，不靠 prompt 堆警告；LLM 自检不可靠，确定性 validator 才是最终 enforcement。

---

## 3. 哪些不变（保留的价值）

| 保持不变的事项 | 说明 |
|---|---|
| **分解是主结构** | 仍是组织系统的首要思路 |
| **组合即验证 / 实现即验证** | codegen/实现本身就是分解可行性的检验 |
| **父（协调者）治理资源边界** | 资源由父/协调者分配，子不自行扩权 |
| **验证局部性** | 失败可在块 / 子树内定位与局部重分解 |
| **契约优先的边界** | pre/postcondition、`boundary`（parent guarantees / out-of-scope） |
| **不变量 enforcement 优先于模式枚举** | 先修 enforcement，不堆特判 |
| **LLM 探索 + 确定性 validator enforcement 分工** | agent 负责开放探索，validator 负责合法性把关 |
| **状态机治理** | `draft → compile → promote → snapshot`，accepted 只读、不可直接编辑 |

---

## 4. 哪些改变（方向变换）

| 改变 | 旧（树中心递归） | 新（验收驱动、少量分工代理） |
|---|---|---|
| agent 数量 | 海量节点，每节点一 agent | 少量分工代理（结构 + 实现 + 可选评审） |
| 结构生成方式 | 逐节点递归分解 | 结构代理一次给出功能块图 |
| 结构形态 | 强制树（children 递归） | 图（块 + 端口 + 连接器 + 依赖，复用 → DAG） |
| 结构起点 | 抽象目标自上而下分解 | 从 PRD **验收要求**出发：AC → 触发→反馈树 → 聚合分层块图 |
| 流程表达 | 线性 / 隐含 | **分支**：触发→反馈树（正常主干 + 各故障/失败/降级路径） |
| 反过度防御 | 枚举 out_of_scope | **traceability `source`**：每分支/块可追溯到 AC/FR |
| 承载 | 自研 pipeline | **复用 BlockGraph MCP**（`kuang-tu_MCP`）的图/状态机/质量门/多代理治理 |
| 对分解的判定 | 求正确 | **判合法 + 合理**：validator 判合法性，评审判可接受度 |

---

## 5. 新架构（草图）

```
验收来源（PRD.acceptance_criteria / functional_requirements / input_spec）
        │
        ▼
TriggerFeedbackTree（触发→反馈树）
   ├─ root = 触发 + 前置条件
   ├─ 内部节点 = 决策点（guard_condition → 分支）
   ├─ leaf = 反馈契约（feedback_type: success | business_fail | system_error | degraded）
   └─ source = AC/FR（traceability，防过度防御）
        │  聚合
        ▼
FunctionalBlock 图（Block + Port + Connector，分层 parent_id）
   ├─ covered_flow_paths[]（聚合引用的路径集合，一块多路径）
   ├─ function_spec（inputs/outputs/pre/post/invariants/side_effects/error_handling）
   ├─ boundary（in_scope/out_of_scope = parent_guarantees / non_responsibilities）
   └─ source（traceability）
        │  编译
        ▼
draft → compile → promote → snapshot        ← 状态机（复用 BlockGraph）
```

### 分工（少量代理）

- **结构代理**：从验收推导触发→反馈树，聚合成分层功能块图，写入 MCP。
- **实现代理**：读 MCP 中某块 → 实现 → 对块覆盖的流程路径集合验证（实现即验证）→ 发现问题批注回流。
- **评审**：合理性把关（评审 findings / quality gate），不做"唯一正确"判定。

### 确定性不变量（validator 红线，可软件化）

1. **职责合法**：块未新增职责（未越权到 parent 明确排除/未分配的检查）。
2. **资源边界足够且不越界**：合法职责下的 read/write/global 由 parent 分配，child 不自行扩权。
3. **接口可绑定**：块间通过 port + connector 表达，数据流一致。
4. **图无环**：块可拓扑排序（环是责任边界切错的信号）。
5. **traceability**：每个分支/块有 `source`（可追溯到 AC/FR），无 source 视为过度防御。

### 聚合规则

**不写死**，作为受约束的启发式：

- **共享/复用**：被多条流程路径复用的行为单元 → 底层共享块候选（对齐 BlockGraph `detect_shared_dependencies`）；
- **业务内聚**：一个 trigger 的完整路径 / 几个紧密 trigger → 上层块候选。

这两条是**引导信号**，不是决定算法的规则；结构代理在合法性约束内自由聚合，容忍多解。

---

## 6. BlockGraph MCP 的复用

`kuang-tu_MCP`，仓库名 `blockgraph-mcp`，是这套设计理念**已落地**的载体：

- **图模型**：Block（name/purpose/parent_id 分层）+ Port（name/direction/contract）+ Connector（source_port/target_port/protocol/evidence）；
- **三层图**：Code Fact Graph（扫描事实）/ Block Graph（语义）/ Flow Graph（入口触发流程）；
- **状态机**：`draft → compile → promote → snapshot`，accepted 只读；
- **质量门**：coverage / missing modules / shared dependencies / connector audit / flow sufficiency；
- **多代理治理**：work package → module proposal → proposal review → coordinator merge。

### 关键错位与本次动作

BlockGraph 是**逆向**（从已有代码反推），锚点全部在 `code_entity_id` + `evidence`(file/line)，且 **Flow 无分支**（README 明说 "Flows do not support branching execution"）。

本次方向是在其上扩展一个**正向图层**：

1. **来源锚抽象**：把锚从 `code_entity` 抽象为 `source_ref`（可指向 AC/FR/触发树节点），使正向生成与逆向维护共存；
2. **分支流程**：把线性 `FlowStep` 扩展/升级为 `TriggerFeedbackTree`（decision_point + branches，正常 + 各故障路径）；
3. **traceability 门**：每块/每分支具 `source`，`compile` 校验"分支必须有验收来源"。

---

## 7. Schema 方向（草案）

```ts
// TriggerFeedbackTree —— 分支流程（新增量最大处）
interface TriggerFeedbackTree {
  id: string; trigger_id: string;
  root: FeedbackNode;
  source: string;               // ac_id / fr_id
}
interface FeedbackNode {
  type: "decision_point" | "action" | "feedback_leaf";
  guard_condition?: string;     // 决策分叉条件
  branches?: FeedbackNode[];    // 正常主干 + 各故障/失败/降级路径
  feedback_type?: "success" | "business_fail" | "system_error" | "degraded";
  source: string;               // traceability（防过度防御）
}

// FunctionalBlock —— 分层聚合块（对齐 BlockGraph.Block + node_schema.function_spec）
interface FunctionalBlock {
  id: string; name: string; purpose: string;
  parent_id: string | null;     // 分层
  function_spec: { inputs; outputs; preconditions; postconditions;
                   invariants; side_effects; error_handling };
  boundary: { in_scope: string[]; out_of_scope: string[] }; // = parent_guarantees / non_responsibilities
  ports: { name; direction: "in" | "out"; contract: string }[];
  deps: { to_block; protocol; source }[];
  covered_flow_paths: string[]; // 聚合引用的路径【集合】，一块多路径
  source: string;               // traceability
  status: "draft" | "accepted" | "stale" | "disputed";  // 复用状态机
}
```

**粒度**：由**聚合层内聚度**决定，不由流程步数决定——一个块覆盖多条路径（`covered_flow_paths` 为集合），聚合层越高集合越大、边界越内聚。

---

## 8. 旧 MVP 归档

树中心递归分解方向的 MVP（`mvp/mvp-0.1` 至 `mvp/mvp-0.4.5`）已归档至 `mvp/archive-tree-centered/`。新方向不再从它推进；其验证结果保留在 `docs/ai/log/` 与 `hot.md` 作历史参考。

---

## 9. 落地形态

- **Skill**（过程指导，无状态）：教结构代理"如何从验收 → 触发→反馈树 → 聚合分层块图"，并给合法性约束与启发式信号；
- **MCP**（运行时共享状态/工具）：承载功能块图、每块 spec、批注流,（结构代理写、实现代理读）。

Skill 与 MCP 的分工是：skill 教"怎么做"，MCP 提供"记录/查看/批注"的共享记忆与工具。

---

## 10. 关键结论（Provenance: 方向性结论，待用户批准）

- [ ] 从"树中心递归"转向"验收驱动结构推导 + 少量分工代理"。
- [ ] 分解/聚合无唯一正确答案：不变量是边界，validator 判合法，评审判合理。
- [ ] 复用 BlockGraph MCP（`kuang-tu_MCP`）作为载体，扩展正向图层 + 分支流程 + traceability 门。
- [ ] 旧树中心 MVP 归档，新方向待落地为 skill + MCP。

> 以上为方向性结论，尚未进入"已批准实现队列"，需用户明确批准后再由 Claude Code 落地或 create skill。
