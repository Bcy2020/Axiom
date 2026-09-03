# Axiom

**From acceptance criteria to a layered, contract-first structure — derived, not approximated.**

Axiom is an *acceptance-driven structure derivation* method: starting from a PRD's **acceptance criteria**, a **structure agent** unfolds a trigger→feedback tree and **aggregates** it into a **layered functional-block graph** (blocks + ports + dependencies), which an **implement agent** realizes and validates against. It is the successor to the tree-centered recursion direction, which is retained as a documented predecessor (see [`CHRONOS-PREDECESSOR.md`](CHRONOS-PREDECESSOR.md)).

> **Working title / naming note.** The name *Axiom* is provisional. As the method grows into a full **agent coding system**, the name is expected to become **AxiomOS** (the two-letter suffix reserved). Repos / packages currently named `Axiom` are the foundation for that evolution.

---

## The core problem Axiom answers

Most AI coding systems solve **task execution**: generate code, follow a plan, parallelize chunks, recover context. But construction at project scale is also a **structural** problem:

- can the system be decomposed in a stable, checkable way?
- can a parent capability actually be realized *by* its child blocks?
- can local implementation be validated *early*?
- can a change or defect be localized to the affected part of the structure?
- does AI parallelism scale without losing architectural coherence?

Axiom treats these as **first-class invariants** rather than workflow hygiene.

## Why acceptance-driven, not recursive decomposition

The prior direction (kept as predecessor) decomposed by repeatedly recursing a tree, with one fresh agent per node. That produced three compounding problems (measured on a 142-node run):

- **cost & latency**: hundreds of serial LLM calls; input tokens re-serialized per call; near-zero prefix-cache hits;
- **upstream distortion**: a parent can't foresee what a child will actually need, so legitimate child requests were misread as violations (defensive overreach / resource underallocation / interface selection gap share one root cause);
- **no room for agent dialogue**: a one-shot, parent-dictates-all model can't express the negotiation a real coordinated build needs.

Axiom therefore derives structure from the **acceptance criteria** at the source (AC → trigger→feedback tree → aggregated layered block graph), with a **few agents** (structure + implement + optional review), and with **branching** (normal + every failure/degraded path) encoded in the tree.

### What stays the same

- decomposition is still the organizing principle;
- **implementation-as-validation** (realizing a block tests whether the decomposition is viable);
- the coordinator still governs the resource boundary;
- **validation locality** (a failure is attributable to a block/subtree);
- contract-first boundaries (`boundary` = parent guarantees / out-of-scope);
- **invariant-first enforcement** — fix the invariant, don't pile on per-case patches;
- LLM explores, a **deterministic validator enforces** (LLM self-check is not the enforcement point);
- state-machine governance (`draft → compile → promote → snapshot`; an accepted graph is read-only).

### What changes

- a few agents instead of many recursive nodes;
- one structure agent emits the **block graph** in one go (graph, not a mandatory tree; shared blocks across flows → DAG);
- structure starts from **acceptance criteria**, not an abstract top-down goal;
- **branching** is first-class; every branch/block carries a **traceability `source`** back to an AC/FR (guards against defensive overreach);
- decomposition/aggregation has **no single correct answer**: invariants define legality, the validator judges legality, review judges reasonableness.

## Strong/weak-agent division of labor

A core finding driving Axiom's design: **what is hard for a model is not always the same step.** Measured across real PRD decompositions:

> The **structure-derivation step** (where to split, how to layer, whether a conservation invariant actually holds) is the high-error, hard-to-detect step — it **must** lean on the **stronger** model. The **implementation step** (follow a block spec) is lower-risk, because a deterministic validator and unit tests can catch a weak model's mistakes.

Concretely: a weak model doing structure derivation tends to produce a **flat** graph (all blocks at the top level, no parent-child layering), which makes the **conservation checks silently no-op** (they only trigger on parent-child relationships). A strong model produces a **layered tree** that actually exercises the conservation invariants. This is documented per-experiment in [`experiments/`](experiments/).

So Axiom's division is:
- **structure derivation** → strongest available agent (the error multiplier is highest here);
- **implementation** → weaker agent is acceptable **only** because validation (compile/conservation/tests) safeguards it.

This is the current working route, not a settled final architecture — see [`docs/acceptance-driven-direction-change-zh.md`](docs/acceptance-driven-direction-change-zh.md).

## Repo layout

```
Axiom/
├── docs/
│   ├── acceptance-driven-direction-change-zh.md   — the full direction change (zh)
│   ├── schema-design-acceptance-driven-zh.md        — schema design (zh)
│   ├── trigger-trace-and-conservation-zh.md         — trigger trace + conservation, V2 (zh)
│   └── skill/acceptance-driven-decomposition/SKILL.md — the driving skill
├── mcp/                                            — the acceptance-driven MCP server
│   ├── src/graph/   schema / store / draft / compiler
│   ├── src/mcp/     tools / server
│   ├── tests/       vitest
│   └── scripts/     smoke + MCP-over-stdio round-trip
├── experiments/                                    — real PRD decompositions (each = a README)
│   ├── test_3D/          weak-model: flat graph, conservation no-op (counterexample)
│   ├── test_3D-modelB/   strong-model: 3-level tree, conservation exercised 8/8
│   └── music/            strong-model: DAW, layered + conservation 3/3 + coverage 44/44
└── CHRONOS-PREDECESSOR.md                          — the tree-centered predecessor
```

## The MCP

`mcp/` is an MCP (Model Context Protocol) server that makes "derive structure from acceptance criteria" a first-class, queryable state. It's the forward-direction counterpart of the predecessor repository's blockgraph tool. Anchored on `SourceRef` (ac / fr / trigger / flow_node / derived) rather than a code entity, so it works **before any code exists**; compiled against deterministic invariants (legality, not correctness). See [`mcp/README.md`](mcp/README.md).

## Running it

```bash
cd mcp
pnpm install     # deps (Node built-in node:sqlite — no native build)
pnpm build       # tsc type-check
pnpm test        # vitest
npx tsx scripts/smoke.ts       # handler-level self-check (deterministic data)
npx tsx scripts/mcp-client.ts  # MCP-over-stdio round-trip
```

## Driving skill

The method is captured as a skill that instructs an agent (the structure agent) to walk a PRD's acceptance criteria against these MCP tools:
`docs/skill/acceptance-driven-decomposition/SKILL.md`

## Experiments

Real decompositions, each with a README explaining what the model produced and what it means for the route (strong/weak division of labor):
- [`experiments/test_3D/`](experiments/test_3D/) — 3D modeling PRD (counterexample: weak model → flat graph)
- [`experiments/test_3D-modelB/`](experiments/test_3D-modelB/) — 3D modeling PRD (strong model → layered tree, conservation exercised)
- [`experiments/music/`](experiments/music/) — DAW PRD (second complex sample)

## Predecessor

The tree-centered recursion direction lives on as a documented predecessor:
[`agent-chronos-arch`](https://github.com/Bcy2020/agent-chronos-arch) — see [`CHRONOS-PREDECESSOR.md`](CHRONOS-PREDECESSOR.md).

## License

[MIT](LICENSE) — © 2026 Bcy2020.
