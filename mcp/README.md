# Axiom — acceptance-driven MCP v0.1

The MCP server that makes Axiom's core idea a first-class, queryable state: derive a **layered functional-block graph** from a PRD's **acceptance criteria**, then record, compile, and inspect it. This is the forward-direction counterpart of the predecessor repository's (blockgraph) tooling.

It turns "从验收驱动的结构推导" into actual data:

```
PRD.acceptance_criteria / functional_requirements
        │
        ▼
TriggerFeedbackTree     (trigger → feedback tree, branching: normal + failure paths)
        │  aggregate (layered, one block covers many paths)
        ▼
FunctionalBlock graph   (blocks + ports + dependencies, parent_id layering)
```

Anchored on `SourceRef` (ac / fr / trigger / flow_node / derived) rather than a code entity — so it works **before any code exists**. Compiled against deterministic invariants (**legality only**, not "correctness"): the validator judges legality, review judges reasonableness.

## Why (short)

The predecessor (tree-centered recursion, ~142-node run) hit cost/latency blow-up, upstream distortion (a parent can't foresee what a child needs), and no room for agent dialogue. Axiom instead derives structure from the **acceptance criteria** with a **few agents**. See `../docs/acceptance-driven-direction-change-zh.md` (direction change, zh) and `../docs/schema-design-acceptance-driven-zh.md` (schema design, zh).

## Current scope (v0.1, hardened)

- Derive trigger → feedback tree → layered functional-block graph from a real PRD, via MCP tools.
- A mounted agent can **record** the decomposition and **query** it back; `compile_block_graph` validates deterministic invariants.
- Store is per-`repoPath` (`<repoPath>/.acceptance/acceptance.db`, Node built-in `node:sqlite`, WAL mode). `begin_initialization` persists the last-used repo path so an omitted path falls back to it rather than to an empty default store.
- In-memory editing via `update_block` / `update_trigger` / `update_data_source` (any edit returns the block to draft; must recompile + re-promote; `ports`/`deps` are replaced atomically when provided).
- Settled state machine: `draft → compile → promote → snapshot`; accepted blocks are read-only unless edited (which returns them to draft).

## Tools (current: 25)

`begin_initialization`, `session_status`, `reset` (mode: `all` | `drafts`), `record_trigger`, `record_flow_tree`, `propose_block`, `record_port`, `connect_dependency`, `compile_block_graph`, `list_blocks`, `query_block`, `list_data_sources`, `record_data_source`, `record_trigger_trace`, `query_trigger_trace`, `list_trigger_traces`, `list_triggers`, `list_flow_trees`, `query_flow_tree`, `query_requirements_coverage`, plus the in-place editors `update_block`, `update_trigger`, `update_data_source`.

## Mounting it

Add to an MCP client (e.g. `.mcp.json` or your agent's MCP config):

```json
{
  "mcpServers": {
    "acceptance-driven": {
      "command": "node",
      "args": ["--import", "tsx", "src/mcp/server.ts"],
      "cwd": "<path-to-Axiom>/mcp"
    }
  }
}
```

Then point the client's working directory at a project dir via `begin_initialization({ repo_path })`.

## Running locally

```bash
pnpm install        # deps (uses Node built-in node:sqlite — no native build)
pnpm build          # tsc type-check
pnpm test           # vitest
npx tsx scripts/smoke.ts       # handler-level self-check (deterministic data)
npx tsx scripts/mcp-client.ts  # MCP-over-stdio round-trip (list tools + call one)
```

Note: `better-sqlite3` was dropped in favor of Node 24 built-in `node:sqlite` (the experimental warning is harmless).

## Project structure

```
src/
  graph/schema.ts    — forward-direction data model (SourceRef, TriggerFeedbackTree, FunctionalBlock…)
  graph/store.ts     — node:sqlite store (triggers / flow_trees / blocks / ports / deps / trigger_traces / data_sources)
  graph/draft.ts     — CRUD service (atomic createBlock, resetDrafts FK detach, update_* read-modify-write)
  graph/compiler.ts  — deterministic invariant compilation (interface + global-state conservation, traceability, acyclic)
  mcp/tools.ts       — tool handlers (input normalization, instructive errors, BLOCK_EXISTS / NOT_FOUND)
  mcp/server.ts      — MCP server (stdio)
```

## Real decomposition (the feasibility check)

Mount this server in an agent conversation, then have that agent act as the **structure agent**: read a real PRD, and for each acceptance criterion call `record_trigger` → `record_flow_tree` → `propose_block`, then `compile_block_graph` and inspect with `query_*`. See the schema design doc §6.

Real decompositions against this approach are recorded in `../experiments/` (see the READMEs there — including the flag where a flat graph makes the conservation checks no-op).

## Driving skill

The method is captured as a skill instructing an agent (the structure agent) to use these tools against a PRD's acceptance criteria:
`../docs/skill/acceptance-driven-decomposition/SKILL.md`
