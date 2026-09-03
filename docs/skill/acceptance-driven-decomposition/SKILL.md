---
name: acceptance-driven-decomposition
description: 指导 agent 用 acceptance-driven MCP 从 PRD 的验收要求推导出"触发→反馈树 + 触发连线(TriggerTrace) + 分层功能块图"。当用户要求从 PRD/验收标准/需求描述推导功能结构、做验收驱动的功能分解、拆解一个产品到可实现的模块、或让结构代理按"触发→反馈→聚合分层块→触发连线→双守恒"的方式建模时，务必使用本 skill。
---

# 验收驱动结构分解

## 你在做什么（先懂 why）

你充当**结构代理**：从 PRD 的**验收行为**推导出功能结构。它不靠递归猜子目标——而是从"应当行为"（触发→反馈）出发，让结构**从必须满足的行为里浮现**。这正是"实现即验证"的前提：每条路径都能对着验收验证。

核心回路：**触发 → 应当反馈树（含正常+各故障分支）→ 触发连线（哪个块实现 + effect + 数据源变更）→ 聚合分层功能块图**。三条主轴：**空图分解前置全局状态源**、**双守恒（接口 + 全局状态）由编译器兜底**、**触发连线做分解自查**。

## 核心规则（不可违反）

1. **不直接写图 JSON**。一切变更都通过 acceptance-driven MCP 工具（`record_*` / `propose_*`）。
2. **起点是验收/功能行为，不是抽象目标**。每个 trigger 来自一条验收标准/功能点。
3. **每个分支、每个块必须有 `source`**（traceability，可追溯到 AC/FR/触发/流程节点）。没有 source 的分支视为过度防御，剔除。
4. **分块是聚合分层，不是逐步骤一块**。粒度由聚合层内聚度决定，不是流程步骤数。
5. **编译校验合法性**（`compile_block_graph`），按 diagnostics 修正；先修不变量，不堆特判。
6. **空图分解先从全局状态源出发**（`record_data_source`）：先定义数据从哪来/到哪去，再看每个块对它做什么——否则状态源混乱、全局状态守恒无从谈起。
7. **触发是入口锚**：不进块图、不被实现，只用于**触发连线**（`record_trigger_trace`）与**分解自查**（`query_trigger_trace`）。
8. **双守恒分开**：接口守恒只管接口集合（`ports` 暴露），全局状态守恒只管数据源操作（`data_operations`），两者各自独立校验、各自报错。

## MCP 工具速览（acceptance-driven V2）

| 工具 | 用途 |
|---|---|
| `begin_initialization` | 打开/重连会话（`repo_path` 指向工作目录） |
| `record_data_source` | 记录一个全局状态源（id/name/category/access_mode/entities/operations） |
| `record_trigger` | 记录一个触发（id/name/command/precondition/source） |
| `record_flow_tree` | 记录一棵带分支的触发→反馈树（id/trigger_id/root/source） |
| `propose_block` | 聚合/派生一个分层功能块（id/name/parent_id/function_spec/boundary/ports/deps/data_operations/source） |
| `update_block` | **就地改写**已存在块（id 保留）。提供即替换（`ports`/`deps` 提供则整组替换）；**任何修改把状态置回 `draft`**，需重新编译+提升。评审反馈改块就用它，**不要全重置重建** |
| `update_trigger` / `update_data_source` | 就地改写触发 / 数据源（id 保留） |
| `record_port` / `connect_dependency` | 记录块边界端口（`scope: external\|internal`）/ 块间依赖 |
| `record_trigger_trace` | 记录触发→块连线（effect/data_source_effects/branch/parent_trace_id） |
| `compile_block_graph` | 校验确定性不变量，支持 `block_id` 局部编译 |
| `promote_block` / `commit_snapshot` | draft→accepted 提升 / 增量快照 |
| `query_trigger_trace` | 从某触发展开成调用树（触发→块→子块→数据源变更，含 error 分支）——**分解自查** |
| `query_requirements_coverage` | **PRD 绑定反查**：从 AC/FR → 触发 → 块 反向枚举覆盖矩阵。与 PRD 全文对照，任何 PRD 验收条目在此矩阵中缺失 = 被遗漏的需求 |
| `list_triggers` | 列出全部触发（每个带 `source` = 它对 PRD AC/FR 的绑定） |
| `list_blocks` / `query_block` / `list_data_sources` | 查看块 / 数据源 |
| `list_flow_trees` / `query_flow_tree` | 查看某触发→反馈树 |

> 查看工具（`query_*` / `list_*`）是**对照完成**的手段——分解后用它核对，不要跳过。

> **评审反馈改块（不要全重置）**：有审阅意见要改某块时，用 `update_block{ id, <要改的字段> }` 就地改写（id 保留；`ports`/`deps` 提供则整组替换）。任何修改把该块状态置回 `draft`，随后 `compile_block_graph{}` 重新校验、`promote_block{}` 重新提升。**不要为改一块就 `reset` 全量重建**——触发器/数据源/其它块都保留。`update_trigger`/`update_data_source` 同理。

## 工作流

### Step 0 — 评估 + 技术栈
读 PRD 后先给：功能概览、规模/复杂度评估、明确技术栈（语言/框架/数据存储）。这决定"哪些是全局状态源"。

### Step 1 — 初始化
```
call begin_initialization{ repo_path }   // 指向项目/工作目录
```
先 `reset`（若要全新分解）。两个模式：
- `reset{ mode:"all" }`（默认）：清空全部（块/流树/触发连线/依赖/触发/数据源）—— 新起一个分解用这个。
- `reset{ mode:"drafts" }`：只清 `draft` 状态块及其连线/端口/依赖，**保留已 `accepted` 的块**与触发/数据源 —— 增量迭代、重做某层时用它，避免重建成型部分。

> ⚠ **持久化/路径**：数据存放在 `repo_path/.acceptance/`。**同一工作区必须每次用同一个 `repo_path`** —— 否则数据会"像丢了"，其实是分散到不同 store（`begin_initialization{}` 不传时**默认沿用上次用过的 repo_path**，但显式传最稳妥）。若 `begin_initialization{}` 打开了一个空库，先 `session_status` 看 `repo_path` 对不对。

### Step 2 — 全局状态源（空图分解前置）
先定义数据流与状态源（全局状态守恒的载体）。识别：**数据往哪存、从哪读、被哪些输入/外部系统驱动**。每个源记录 `category`（db/input/fs/external/cache）、`access_mode`（read/write/read_write）、`entities`、`operations`。
```
call record_data_source{ id, name, category, access_mode, entities[], operations[] }
```

### Step 3 — 从 PRD 拆功能点 → trigger
通读 PRD，识别**用户可触发的功能行为**（"按下/输入/选择 X，在条件 C 下应当 Y"）。每个功能点对应一个 `trigger`。若 PRD 是自然语言（无结构化 AC），就按"应当行为"提炼功能点；若已有 acceptance_criteria，则逐条映射。

**每一个 trigger 都必须绑定一个 PRD 验收条目**（`source = {kind:"ac", ac_id}` 或 `{kind:"fr", fr_id}`）——这是"PRD 绑定"的基础：只有绑定才能被 `query_requirements_coverage` 反查出覆盖。不要无源建模；来自其它 trigger/聚合的 trigger 不能作为验收归属。
```
call record_trigger{ id, name, command?, precondition?, source }  // source = {kind:"ac", ac_id} 或 {kind:"fr", ...}
```
> ⚠ **无"验收标准"段**：此时没有 ac_id 可绑，就把 trigger 绑到**原始需求条目**（`source = {kind:"fr", fr_id}`，fr 当作需求清单/ground truth）。需知 `query_requirements_coverage` 此时**抓不住整条漏项**（`uncovered` 恒 0），完整性检查交给 Step8 的 **8c 重建 round-trip**；若重建漏检再回退"补写验收 + 覆盖清单锚点"。

### Step 4 — 顶层块 + 接口
从所有 flow tree 聚合出**顶层块**（不要一开始就逐层细化到底）：`function_spec`（inputs/outputs/pre/post/invariants/error_handling）、`boundary`（in_scope / out_of_scope）、`ports`（in/out + contract；对内互连的端口标 `scope:"internal"`）。同时声明块对各数据源的操作 `data_operations`（供全局状态守恒）。
```
call propose_block{ id, name, purpose, parent_id, function_spec, boundary, ports[], deps[], data_operations[], source }
```
**字段要点（避免常见错误）：**
- **`function_spec` / `boundary` 是对象，不是 JSON 字符串** —— 传 `{"inputs":[...], ...}` 对象，**不要**传 `"{\"inputs\":...}"` 字符串。
- `data_operations[]` **每条必须是** `{ "data_source_id": "...", "access_mode": "read" | "write" | "read_write" }` —— 字段名是 `access_mode`，**不是** `operation`/`op`。用错字段会报 `UNKNOWN_DATA_SOURCE`。
- `source` **是对象**：聚合块用 `{ "kind": "derived", "from": [SourceRef], "reason": "..." }`，其中 `from` 是**结构化 SourceRef 数组**（如 `[{kind:"flow_node", node_id:...}]`），**不是字符串数组** —— 写 `from:["n1"]` 会导致 `NO_SOURCE`。
- **`deps[]` 是**有向 Dependency 对象数组**，不是字符串列表！** 每条 `{ "id"?, "source_block_id", "target_block_id", "protocol"?, "source"? }` —— `source_block_id`→`target_block_id` 表示"谁依赖谁"（有向）；`["blk_app"]` 这种字符串列表**没有方向**，会被判为错误。示例：`[{"source_block_id":"blk_render","target_block_id":"blk_app","protocol":"data"}]`。
- 每个 `ports[].id` 是**全局唯一**（跨块）。建议用 `<块名>_<端口名>` 前缀（如 `sk_curves`），避免多个块撞 ID 报 `UNIQUE constraint failed: ports.id`。

> 整张图先铺出主干层；聚合没有唯一正确答案，允许合理多解。

### Step 5 — 触发连线（哪个块实现）
给每个 trigger 记录它串到哪块 + 实现效果 + 数据源变更 + 分支。effect 按**当前块粒度粗写**（如"产生 log / 写入某文件 / 引箭头指向某数据源并改变它"），不追求精确。分支 `normal` / `error-N` 串出错误处理路径，可用 `parent_trace_id` 串径分层（上层 trace → 这层）。
```
call record_trigger_trace{ id, trigger_id, target_block_id, effect, data_source_effects[], branch, parent_trace_id? }
```

### Step 6 — 下一层 + 连线细化
分层往下：已连块的块再分解（子块 `parent_id` 指向它），trace 跟着细化（更细的 block 级 trace）。**双守恒在这里生效**：
- 接口守恒：父块外部接口（`ports` 暴露）应被子块外部接口**不多不少**覆盖；
- 全局状态守恒：按**访问能力**（read/write 位）比较，父块声明子树所需**最高 access_mode**即可——`read_write` 覆盖 `read`/`write`（无需并集冗余声明）；只要某子块实现了 write、某子块实现了 read，父块声明 `read_write` 即合法。每块只操作**已声明**的数据源。
> 这是编译器兜底：不一定一次符合守恒，让 `compile` 报 `IFACE_UNCOVERED` / `IFACE_OVERREACHED` / `GS_OP_*` / `UNKNOWN_DATA_SOURCE`，按 diagnostics 修。

### Step 7 — 增量编译（做一部分、编译一部分、promote）
每做完一层/一个块，**局部编译**它（`compile_block_graph{ block_id }`），`ok` 后 `promote_block` 置为 accepted，再继续下一部分（增量编译：做一部分、编译、promote、再做下一部分）。
```
call compile_block_graph{ block_id }    // 局部
call compile_block_graph{}              // 全图，最后收口
call promote_block{ block_id }
```
按 diagnostics 修正：traceability 缺失 / 引用未知 / 职责越权 / 依赖无环 / 接口守恒 / 全局状态守恒。重复直至 `ok: true`。

### Step 8 — 自查（三闸收口）
分两条线收口：**机械红线（确定性）+ 反推审计（启发式）**。

**8a 机械红线（确定性）—— PRD 绑定覆盖矩阵：**
```
call query_requirements_coverage{}       // AC/FR → 触发 → 块 覆盖矩阵（PRD 绑定反查）
```
把矩阵与 PRD 的验收条目清单对照，凡 PRD 条目在矩阵缺失（无 trigger / 无连线）即**漏需求**，须在收口前补块与触发连线。
> ⚠ **无"验收标准"段的 PRD**：`query_requirements_coverage` 是 trigger-driven，只能枚举"被某 trigger 引用过的 ac/fr"，**抓不住"连 AC 都没写、也没绑 trigger"的整条漏项**（`uncovered` 恒 0）。这种 PRD 的完整性检查**以 8c 重建 round-trip 为主**，不必先补写验收。若重建随后被证明漏检（幻觉/不稳），再回退"先补写验收 + 覆盖清单锚点"当机械红线。

**8b 结构自查（确定性）—— 触发调用树：**
```
call query_trigger_trace{ trigger_id }   // 触发→块→子块→数据源变更，含 error 分支
call query_flow_tree{ tree_id }
call query_block{ block_id }
```
用 `query_trigger_trace` 拉出某触发调用树，核对：每个触发是否串到该串的块、数据源变更是否对齐、error 分支是否被实现。

**8c 反推审计（启发式，新增）—— PRD 重建 round-trip（串行两阶段 + 闭环复审）：**
「重建 → 比对」是**严格的串行两阶段，不可并行**——比对代理的输入之一就是重建代理的产出，二者有因果依赖（必须先拿到重建文档，才能启动比对）。
- **① 重建代理（PRD 盲）**：**只读分解产物**（`list_blocks` / `query_block` / `list_data_sources` / `list_trigger_traces`），**不看 PRD 原文**，重述"这套分解能实现的功能"，输出一份**功能级"重建 PRD"**（特性/行为级，不是块树级），**每条功能标注来源块/端口**。**等到它返回、拿到重建文档，才进阶段②**。`SourceRef` 只存 ac/fr id 不存文本，所以块上的 source 不会泄漏需求内容，天然真盲。
- **② 比对代理（对抗，必须等阶段①完成）**：**只读原 PRD + 重建文档**，不看分解，找三类差异——**缺失**（原 PRD 有、重建无）、**失真**（同一功能语义不同）、**多余**（重建有、原 PRD 无 = 越权/过度防御）。产出**差异清单**。
- **闭环修改（务必走通，不是审查完就交付）：** 主 agent 依差异清单，用 `update_block` 回溯修正具体块 → `compile_block_graph{}` 重验 → `promote_block` 重提升；**改完必须再跑一遍 8c（重建→比对）复审**，循环到差异清单为空 / 无实现级差异。
- **熔断（最多 3 轮，否则无限制）：** 8c 收口循环**最多 3 轮**（1 轮 = 一次完整"重建→比对"，若出差异则随之修改）。第 3 轮结束后**仍存在**"会影响到实现"的差异 → **立即停止自动循环并升级**：把剩余差异清单 + 已改块 + 各轮差异数汇总汇报给用户/上层，由人裁定（继续深挖 / 接受当前 / 换方案），**绝不无限轮次自闭循环**。每轮记录"轮次 / 差异数 / 改动块"，便于收敛判断。
- **复用原子代理保连贯（推荐，非强制）：** 复审时**优先复用**上一次的重建/比对代理（同一会话上下文——它已理解分解与 PRD，修正后更能量身复审）。但**不强制**：若平台/编排不支持子代理复用，就按"差异清单 + `update_block` 修改 + 重跑 8c"闭环。
- **及格线**：重建 PRD 与原 PRD 无"会影响到实现"的差异。

确认后向用户汇报块图结构。汇报应附：覆盖矩阵（标注未覆盖项）+ 重建比对差异（如有）。

## 判据速查

- **分支完整性**：正常主干 + 各 `business_fail` / `system_error` / `degraded`。不遗漏"应当失败反馈"的叶子。
- **粒度判据**：块 = 可独立实现 + 可独立验证其覆盖全部路径的一层功能抽象；由聚合层内聚度决定。
- **防过度防御**：无 `source` 分支剔除；边界 `out_of_scope` 信任父/兄弟（不重复实现）；树内"应当失败"叶子不能被防短路。
- **接口守恒**：父块外部接口 = Σ子块外部接口（不多不少）。`IFACE_UNCOVERED` = 子有父无（子冗余/父缺）；`IFACE_OVERREACHED` = 父有子无（接口泄漏/子未覆盖）。对内互连端口标 `scope:"internal"` 剔除。
- **全局状态守恒**：按访问能力（read/write 位）比较，父块声明子树所需最高 access_mode 即可（`read_write` 覆盖 read/write）；每块只操作已声明源（`UNKNOWN_DATA_SOURCE`）。
- **触发连线**：effect 按块粒度粗写；同一块被多触发串到，effect 可各自不同。
- **PRD 绑定覆盖**：每个 trigger 绑定一条 AC/FR；`query_requirements_coverage` 的矩阵里，PRD 每条验收条目都得有 trigger 承接（缺失 = 漏需求）。
- **诊断顺序**（遇到错误时）：职责是否合法 → 资源边界是否足够且不越界 → 接口能否绑定 → 接口守恒 → 全局状态守恒 → PRD 覆盖。
- **traceability**：每个块/分支可追溯到 AC/FR/触发/流程节点；聚合块用 `source = {kind:"derived", from:[...]}`。
- **PRD 重建 round-trip**：重建代理盲读（不触 PRD）、按功能级重建（非块树级）、每条标注来源块；**先重建、后比对（严格串行，不可并行）**；比对代理对抗性找缺失/失真/多余；**差异需 `update_block` 闭环修正 → 重跑复审**，**最多 3 轮熔断**（第 3 轮仍有实现级差异则升级给人裁定，不无限循环），无实现级失真为及格线。这是"组合即验证"在 PRD 层的落点。
