# Experiment: music — DAW PRD (strong model, second complex sample)

A second high-complexity decomposition, using a **DAW (Digital Audio Workstation)** PRD, decomposed by a **strong model**. This is intended to confirm the `test_3D-modelB` result is not an artifact of that specific 3D PRD — i.e. that a strong model layers structure **generally**, not just on one sample.

## What was decomposed

A **simplified DAW music host** PRD (`docs/PRD.md` here). This is at least as complex as the 3D PRD: 46 sections, 11 core acceptance scenarios, and domain-modeling-heavy logic (Part model, piano roll, Velocity, Snap, VST Instrument + VST Effect, multi-track real playback, MIDI data, audio export, Loop, Undo/Redo, persistence).

## Model

The same **strong model** family as `test_3D-modelB`.

## What it produced

A **layered** graph: **20 blocks**, of which **9** have a non-`parent_id`. Composite subsystems decompose into child blocks, e.g.:

```
blk_arranger  → blk_partmodel / blk_parttools / blk_arrangerview
blk_audio     → blk_audiochain / blk_meter / blk_audiodevice
blk_pianoroll → blk_noteedit / blk_velocity / blk_prview
```

with 11 top-level subsystem roots (project / transport / tracks / plugins / arranger / audio / pianoroll / import / export / undo / appshell). `deps = 29`. Because the graph is layered, the compiler's conservation checks run.

## Validation results

Re-running the checks yields:

- **global-state conservation**: **3/3 parent blocks pass** (no `GS_OP_UNCOVERED`, no `GS_OP_OVERREACHED`);
- **UNKNOWN_DATA_SOURCE**: **0**;
- **compile**: `errors: []`;
- **8a coverage**: **44/44** covered, `uncovered: 0` — every FR (`fr_03`…`fr_32`) *and* every acceptance scenario (`ac_33`…`ac_46`) is anchored to a trigger→block.

Certain hard, easy-to-miss requirements are captured precisely in block invariants (checked against the PRD): illegal MIDI data guard, note auto-extend past Part end, Glue same-pitch-only + leftmost vel/mute, Mute-tool marquee semantics, Piano-Roll Snap default-on + precision + Alt toggle, export includes Mute/Solo/Master with muted note/track excluded, Undo exact state restoration, ≥32 tracks + independent VST instance, sample-rate match + non-destructive WAV, master clock with no drift.

## Remaining differences (8c)

The reconstruction/comparison round-trip surfaced a bounded set of **constraint-level** gaps — chiefly the **performance baseline** (32 tracks / 50 parts per track / 1000 notes per part, no visible stutter) which was registered only via trigger, not as an invariant on the blocks that do the heavy work, and the concrete shortcut-key set. These are non-functional constraints (they have no trigger and no natural block), which is an open method question — see the Axiom docs on where such cross-cutting constraints should be anchored.

## Conclusion for the route

> A strong model layers structure **on a second, unrelated PRD** (DAW), and the conservation/coverage checks are genuinely exercised and pass. This supports the conclusion drawn from `test_3D-modelB` that **structure derivation should lean on the stronger agent** — it is not specific to one PRD.

It also surfaces the *remaining* open question about where **cross-cutting, non-functional constraints** (performance baseline, policy restrictions) should live, since they have no trigger and thus fall outside the trigger-driven coverage matrix.

## Files

- `docs/PRD.md` — the original DAW PRD
- `decomposition_dump.md` — the decomposition exported for the reconstruction agent (blind)
- `reconstruction.md` — the blind reconstruction
