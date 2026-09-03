# Experiment: test_3D — 3D modeling PRD (weak model)

One of the real-PRD decompositions that motivated Axiom's **strong/weak agent division of labor**.

## What was decomposed

A **3D modeling tool** PRD (`docs/PRD.md` here). This is a high-complexity sample: 2D sketch, 3D generation (extrude/sweep/revolve/shell), boolean ops, Gizmo transform, viewport, materials, import/export, and performance constraints.

## Model

The model that produced this decomposition is referred to here as the **weak model** in the Axiom route terminology (relative to the one used in `test_3D-modelB`).

## What it produced

A **flat** block graph: **11 blocks, all `parent_id = NULL`** — no parent-child layering. Blocks aggregated triggers directly into top-level units, e.g. `blk_app` (declared as the "entry" block and whose `in_scope` covered nearly the union of the other blocks) was **not** wired as a parent of the others.

## Why this is the counterexample

The flat structure makes the two conservation checks **silently no-op**. Both the **interface conservation** check and the **global-state conservation** check in the compiler only run for blocks with a non-`parent_id`; with every block at the top level, they are not exercised.

Re-running global-state conservation *assuming* `blk_app` were the parent of the other 10 yields **`GS_OP_UNCOVERED`** for `ds_render` and `ds_persist` (child blocks operate them, the parent never declared them). In the actual flat graph this gap is never surfaced — **compile still reports "no errors"** even though the parent-aggregation semantics that would reveal the gap are absent.

Also present: `ds_input` declared but referenced by no block (dead source); `deps = 0`; `flow_trees = 0`.

## Conclusion for the route

This is the **counterexample** that motivated the division of labor:

> A **weak model** doing structure derivation tends to produce a **flat** graph, which silently disables the conservation invariants — the checks don't fire, so the graph "passes" without being validated.

This is exactly why Axiom leans the **structure-derivation step onto the stronger model**.

## Files

- `docs/PRD.md` — the original PRD
- `docs/decomposition_report.md` — initial decomposition
- `docs/` — 8c reconstruction/comparison/evaluation artifacts (round 4)
