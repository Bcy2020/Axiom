# Experiment: test_3D-modelB — 3D modeling PRD (strong model)

The **positive** counterpart to `test_3D`: the same 3D modeling PRD, decomposed by a **stronger model**. This pairing is the direct evidence for Axiom's strong/weak division of labor.

## What was decomposed

The **same** 3D modeling PRD (`docs/PRD.md`) as in `test_3D`, with the same MCP and the same skill — the **only** variable is the model.

## Model

Referred to here as the **strong model** in the Axiom route terminology.

## What it produced

A **layered 3-level tree**: **35 blocks**, of which **34** have a non-`parent_id`. The single root is `blk_app`, with intermediate aggregation nodes such as:

```
blk_app
├── blk_gen3d → blk_gen_extrude / blk_gen_revolve / blk_gen_shell / blk_gen_sweep / blk_gen_overlap_parity
├── blk_edit → blk_edit_boolean / blk_edit_material / blk_edit_merge_group
├── blk_primitive → blk_prim_box / blk_prim_sphere / blk_prim_torus
├── blk_sketch → blk_sketch_bezier / _circle / _ellipse / _line / _polygon
├── blk_transform → blk_rotate / blk_translate
├── blk_viewport → blk_view_orbit / blk_view_pan / blk_view_ortho_top / blk_view_grid_snap
└── blk_persistence / blk_render / blk_select / blk_topology
```

with `flow_trees = 28`, `deps = 7`, and a full 8c reconstruction/comparison round-trip (three artifacts: `graph_input.md`, `reconstruction.md`, `diffs.md`).

## Why this exercises the invariants

Because the graph is **layered**, the compiler's conservation checks actually run. Re-running them yields:

- **global-state conservation**: **8/8 parent blocks pass** (no `GS_OP_UNCOVERED`, no `GS_OP_OVERREACHED`);
- **UNKNOWN_DATA_SOURCE**: **0**;
- **compile**: `errors: []`;
- **8a coverage**: all FR entries covered, `uncovered: 0`.

Unlike `test_3D` (where the flat graph made the checks no-op and the parent-aggregation gap was silently hidden), here the parent/child structure is present and the conservation invariants are genuinely validated.

## Conclusion for the route

> A **strong model** doing structure derivation produces a **layered tree**, which actually exercises the conservation invariants — the checks fire and the gaps show up (or, as here, pass because they are satisfied).

The contrast with `test_3D` (same PRD, same MCP, same skill, different model → flat vs layered) is the core experimental evidence for Axiom's **strong/weak agent division of labor**: the structure-derivation step is where the error multiplier is highest and should be assigned to the strongest available agent.

## Files

- `docs/PRD.md` — the original PRD
- `docs/decompose/graph_input.md` — the block-graph data fed to the reconstruction agent (blind)
- `docs/decompose/reconstruction.md` — the blind reconstruction
- `docs/decompose/diffs.md` — the reconstruction-vs-PRD comparison (round 3 final)
