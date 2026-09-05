# Predecessor: agent-chronos-arch (tree-centered)

Axiom is the successor to **`agent-chronos-arch`** (`Bcy2020/agent-chronos-arch`), which explored a **tree-centered, recursive-decomposition** direction for AI software construction.

> This file intentionally keeps the predecessor short. It exists so Axiom's README can point here rather than recapitulate the entire prior direction, and so the historical direction is clearly marked as **superseded**, not deleted.

## What the predecessor was

`agent-chronos-arch` (project name **Agent Chronos 2.0**, now "Chronos") treated software as a tree that is progressively decomposed: a root requirement, expanded through tree decomposition, with one fresh agent per node, node-local implementation, and composition-as-validation. The full text of that direction (README, direction-change doc, MVP archive) lives in the `agent-chronos-arch` repository.

## Why it was superseded

The tree-centered direction was measured and found to hit three compounding problems (recorded against its own MVP 0.4.5 / grade_prd run):

1. **cost & latency** — hundreds of serial LLM calls, input tokens re-serialized per call, near-zero prefix-cache hits;
2. **upstream distortion** — a parent can't foresee what a child actually needs, so legitimate child requests were misread as violations (defensive overreach / resource underallocation / interface selection gap share one root cause);
3. **no room for agent dialogue** — a one-shot, parent-dictates-all model cannot express the negotiation a real coordinated build requires.

These drove the shift to **acceptance-driven structure derivation** with a **few** agents, which is what Axiom is.

## What is preserved from it

Though the recursive tree was superseded, several principles carried forward and remain in Axiom:

- decomposition is still the organizing principle;
- composition-as-validation (in Axiom: implementation-as-validation);
- the coordinator/coordinator governs the resource boundary;
- validation locality (failures are attributable to a block/subtree);
- contract-first boundaries (pre/postconditions, `boundary`);
- **invariant-first enforcement** (fix the invariant, don't patch per case);
- LLM explores, a deterministic validator enforces;
- state-machine governance (`draft → compile → promote → snapshot`).

Also preserved as an artifact: the tree-centered MVP modules (`mvp/mvp-0.1` … `mvp/mvp-0.4.5`) are archived under `agent-chronos-arch/mvp/archive-tree-centered/`.

## Naming note

The predecessor is referenced here (and in Axiom's README and docs) as **Chronos** / **agent-chronos-arch**. The name "Chronos" is deliberately **not** reused as Axiom's name — it is common enough to give no search advantage — and is reserved for the historical branch only.

---

**See also**: [`docs/method.md`](docs/method.md) for the method/design reference; [`agent-chronos-arch`](https://github.com/Bcy2020/agent-chronos-arch) for the predecessor repository.
