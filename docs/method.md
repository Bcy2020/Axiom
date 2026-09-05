# Axiom — Acceptance-Driven Structure Derivation

This is the public/design reference for Axiom. For a shorter high-level read, see the top-level [README.md](../README.md). For the step-by-step procedure used to drive a decomposition, see [`skill/acceptance-driven-decomposition/SKILL.md`](skill/acceptance-driven-decomposition/SKILL.md).

---

## 1. The pipeline

Starting from a PRD, structure is derived in three stages, each of which leaves a queryable artifact:

```
PRD.acceptance_criteria / functional_requirements / input_spec
        │
        ▼
   TriggerFeedbackTree           ← what the system should do for every trigger (normal + each failure path)
        │  aggregate
        ▼
   Layered FunctionalBlock graph ← which block realizes which behavior, with ports + dependencies
        │  compile (deterministic invariants)
        ▼
   draft → compile → promote → snapshot   ← a state machine; an accepted graph is read-only
```

The decisive shift relative to a tree-centered recursion is that structure is derived **from the acceptance criteria at the source**, not by repeatedly recursing an abstract goal. Every object carries a **traceability `source`** pointing back to an AC/FR/trigger/flow-node, which is what guards against "defensive overreach" (an agent inventing behavior that was never asked for).

Because a functional block can aggregate **multiple** flow paths (reuse), the result is a **DAG** (blocks shared across flows) with a **parent** relationship for layering — not a single forced tree.

---

## 2. Core objects

### SourceRef (traceability anchor)

```ts
type SourceRef =
  | { kind: "ac"; ac_id: string }                     // an acceptance criterion
  | { kind: "fr"; fr_id: string }                     // a functional requirement
  | { kind: "trigger"; trigger_id: string }           // a trigger
  | { kind: "flow_node"; node_id: string }            // a node in a trigger→feedback tree
  | { kind: "derived"; from: SourceRef[]; reason: string };  // a block aggregating several sources
```

The anchor is a requirement (or a derived aggregate of requirements), **not a code entity**. This is why Axiom works **before any code exists**.

### Trigger + TriggerFeedbackTree (branching, not a linear flow)

```ts
interface Trigger { id; name; command?; precondition?; source: SourceRef; }

type FeedbackNodeType = "decision_point" | "action" | "feedback_leaf";
type FeedbackType     = "success" | "business_fail" | "system_error" | "degraded";

interface FeedbackNode {
  id; type: FeedbackNodeType;
  guard_condition?;        // where a decision point forks
  branches?: FeedbackNode[];   // normal trunk + each failure/degraded path
  action?;                 // what this action step does
  feedback_type?: FeedbackType;  // the contract for a leaf
  message?; source: SourceRef;
}

interface TriggerFeedbackTree { id; trigger_id; root: FeedbackNode; source: SourceRef; }
```

The tree enumerates "what feedback the system should give in each situation", including every failure path. A `feedback_leaf` is the verification target for *implementation-as-validation*.

### FunctionalBlock (layered aggregate)

```ts
interface FunctionalBlock {
  id; name; purpose;
  parent_id: string | null;           // layering
  function_spec: FunctionSpec;        // contract
  boundary: Boundary;                 // = parent guarantees / non-responsibilities
  ports: Port[];                      // boundary interface
  deps: Dependency[];                 // inter-block dependencies
  source: SourceRef;                  // traceability (often `derived`)
  data_operations: BlockDataOperation[];  // which global state sources it touches
}

interface FunctionSpec {
  inputs: { name; type; description; required?; default?; constraints? }[];
  outputs: { type; description; structure? }[];
  preconditions: string[];
  postconditions: string[];
  invariants: string[];              // hard, easy-to-miss requirements live here
  side_effects?: string;
  error_handling: Partial<Record<FeedbackType, string>>;
}

interface Boundary { in_scope: string[]; out_of_scope: string[]; }   // = parent_guarantees / non_responsibilities
interface Port { id; name; direction: "in" | "out"; contract: string; }
interface Dependency { id; source_block_id; target_block_id; via_port?; protocol; source: SourceRef; }
```

The **granularity** of a block is decided by cohesion at its aggregation layer, not by "one block per flow step". A block may cover many flow paths.

### Global state source (DataSource) + operations

```ts
interface DataSource { id; name; category: "db"|"input"|"fs"|"external"|"cache";
                       access_mode: "read"|"write"|"read_write"; entities: string[]; operations: string[]; }
interface BlockDataOperation { data_source_id: string; access_mode: "read"|"write"|"read_write"; }
```

`DataSource` declares the global state a decomposition touches **before** the graph is filled in. A block's `data_operations` are compared against these to detect over-reach.

### TriggerTrace (trigger → block, the anchor that is not realized)

```ts
interface TriggerTrace { id; trigger_id; target_block_id; effect: string;
                         data_source_effects: string[]; branch: "normal"|"error-1"|"error-2";
                         parent_trace_id?: string; }
```

A trigger is an **entry anchor**: it is recorded, traced to the blocks that realize it, but is **not itself implemented** and does **not** participate in interface conservation. Traces are kept separate from the tree (see §4).

---

## 3. What the compiler enforces (deterministic invariants)

The compiler judges **legality**, not correctness — it is not the arbiter of whether a decomposition is "right" (there is no single right answer; the review judges reasonableness).

**Legality invariants**

1. **traceability** — every block / flow node has a `source`; a missing source reads as invented behavior → reject.
2. **referential integrity** — referenced flow nodes / dependency targets exist.
3. **responsibility legality** — a block's `in_scope` does not include what its parent explicitly excluded.
4. **resource boundary** — the resources a block needs lie within its parent boundary or declared deps/ports.
5. **interface bindability** — an in-port has a source (dependency / parent) and an out-port is consumed.
6. **acyclicity** — the block graph is topologically sortable (a cycle signals a mis-cut responsibility boundary).

**Two conservation invariants (pass/fail, compared by capability not by exact string)**

- **Interface conservation** — a parent's external interface (its exposed `ports` in/out + the interface it exposes via `deps`) is covered by its children **exactly**: neither *uncovered* (child has more than the parent declared) nor *overreached* (parent exposes more than the children realize) may occur.
- **Global-state conservation** — a parent's `data_operations` equal the union of its children's `data_operations`; and every block only touches a **declared** DataSource (operating an undeclared source is over-reach).

Access modes are compared on the capability lattice (`read ⊆ read_write`, `write ⊆ read_write`), not by exact equality. Both checks only run for blocks with a **non-null `parent_id`** — which is why a *flat* graph (all blocks at the top level) silently disables them (see §5).

---

## 4. Two layers kept separate

`TriggerFeedbackTree` (the *should-be* behavior tree) and `TriggerTrace` (the trigger→block wiring) are **kept as two separate layers**, not merged:

- the **tree** answers "what feedback should the system give";
- the **trace** answers "which block realizes it, what effect, which data sources change, and along which branch".

A block does **not** declare "which paths it covers" (`covered_flow_nodes` was removed); coverage is derived by tracing a trigger through the blocks it reaches.

---

## 5. Why the agent matters: strong/weak division of labor

A measured finding that shaped Axiom's design: **what is hard for a model is not always the same step.**

> **Structure derivation** (where to split, how to layer, whether a conservation invariant actually holds) is the high-error, hard-to-detect step — it must lean on the **stronger** model. **Implementation** (follow a block spec) is lower-risk, because a deterministic compiler and unit tests catch a weak model's mistakes.

Concretely, a weak model doing structure derivation tends to produce a **flat** graph (all blocks at the top level, no `parent_id`), which makes the two conservation checks **silently no-op** — the graph "passes" without being validated. A strong model produces a **layered** tree that actually exercises them. See [`experiments/`](../experiments/) for the measured instances.

So the division is:
- **structure derivation** → strongest available agent;
- **implementation** → a weaker agent is acceptable *only* because compile/conservation/tests safeguard it.

---

## 6. Driving it: skill + MCP

- **Skill** (stateless process guidance): tells the *structure agent* how to walk a PRD's acceptance criteria against the MCP tools, and what the legality/conservation constraints are. See [`skill/acceptance-driven-decomposition/SKILL.md`](skill/acceptance-driven-decomposition/SKILL.md).
- **MCP** (stateful, queryable store + tools): records triggers, flow trees, blocks/ports/deps, data sources, and traces; exposes the compiler and the view tools. See [`../mcp/README.md`](../mcp/README.md).

The MCP store is a SQLite database at `.acceptance/acceptance.db` next to the repo/workspace being decomposed. In this repo the real decomposition artifacts are committed under `experiments/*/.acceptance/` so the actual graph (not just a prose summary) is inspectable and reproducible.

---

## 7. Self-check for a decomposition

Three deterministic passes support a decomposition:

- **coverage matrix (8a)** — every AC/FR is anchored to a trigger→block; uncovered requirements are reported.
- **trigger trace (8b)** — each trigger expands into its call tree (trigger → block → children → data-source effects, incl. error branches); a self-check for decomposition adequacy.
- **reconstruction round-trip (8c)** — a blind agent reconstructs the intended behavior from the structural dump; the reconstruction is compared against the PRD to surface gaps (max a few rounds, closed-loop).

---

*This document is deliberately free of internal working notes and per-revision "for discussion" qualifiers. The working notes, open questions, and per-revision discussions are kept out of the published repository.*
