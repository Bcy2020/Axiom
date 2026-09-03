/**
 * Acceptance-Driven MCP v0.1 — Compiler / Validator
 * Enforces the deterministic invariants (§4 of schema design).
 * Judges LEGALITY only — not whether a decomposition is "correct".
 */
import type { DatabaseSync } from "node:sqlite";
import { type Diagnostic, type ToolResponse, sourceRefToString, type FunctionalBlock, type Port, type AccessMode } from "./schema.js";
import { listBlocks, getBlock, listDataSources } from "./draft.js";

// §4.1 traceability — every block/flow node must carry a meaningful source.
function checkTraceability(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const b of listBlocks(db)) {
    if (scope && !scope.has(b.id)) continue;
    const s = sourceRefToString(b.source);
    if (!s || s.startsWith("ac:") === false && s.startsWith("fr:") === false && s.startsWith("trigger:") === false && s.startsWith("derived") === false) {
      errors.push({ code: "NO_SOURCE", severity: "error", entity_id: b.id, message: `block ${b.id} has no traceable source (make source a SourceRef object, not a double-encoded string)` });
    }
  }
  return errors;
}

// §4.2 reference completeness — deps / ports point to real entities.
function checkReferenceCompleteness(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const blockIds = new Set(listBlocks(db).map((b) => b.id));
  for (const b of listBlocks(db)) {
    if (scope && !scope.has(b.id)) continue;
    for (const p of b.ports) {
      if (p.direction !== "in" && p.direction !== "out") errors.push({ code: "BAD_PORT_DIRECTION", severity: "error", entity_id: p.id, message: `port ${p.id} has bad direction` });
    }
    for (const d of b.deps) {
      if (!blockIds.has(d.source_block_id) || !blockIds.has(d.target_block_id)) errors.push({ code: "UNKNOWN_DEP_BLOCK", severity: "error", entity_id: b.id, message: `block ${b.id} dep references unknown block` });
    }
  }
  return errors;
}

// §4.3 duty legality — a child's in_scope must not include a parent's out_of_scope.
function checkDutyLegality(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const blocks = listBlocks(db);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const b of blocks) {
    if (scope && !scope.has(b.id)) continue;
    if (!b.parent_id || !byId.has(b.parent_id)) continue;
    const parent = byId.get(b.parent_id)!;
    for (const inScope of b.boundary.in_scope) {
      if (parent.boundary.out_of_scope.includes(inScope)) {
        errors.push({ code: "DUTY_OVERREACH", severity: "error", entity_id: b.id, message: `block ${b.id} in_scope "${inScope}" overlaps parent out_of_scope` });
      }
    }
  }
  return errors;
}

// §4.6 no cycle — blocks must be topologically sortable over deps.
function checkAcyclic(db: DatabaseSync): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const blocks = listBlocks(db);
  const adj = new Map<string, string[]>();
  for (const b of blocks) adj.set(b.id, []);
  for (const b of blocks) for (const d of b.deps) adj.get(b.id)?.push(d.target_block_id);

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  for (const start of blocks.map((b) => b.id)) {
    if (visited.has(start)) continue;
    stack.push(start);
    while (stack.length) {
      const node = stack[stack.length - 1];
      if (!inStack.has(node)) {
        inStack.add(node);
        const next = (adj.get(node) ?? []).find((x) => !visited.has(x) && !inStack.has(x));
        if (next !== undefined) { stack.push(next); continue; }
      }
      const ok = (adj.get(node) ?? []).every((x) => visited.has(x) || x === node);
      if (!ok) { errors.push({ code: "DAG_CYCLE", severity: "error", entity_id: node, message: `cycle detected at block ${node}` }); break; }
      visited.add(node); inStack.delete(node); stack.pop();
    }
  }
  return errors;
}

export interface CompileResult {
  block_count: number;
  trigger_count: number;
  flow_tree_count: number;
  accepted: boolean;
}

// ── V2: Interface conservation (interface sets only) ──────────────────────────
// A parent's EXTERNAL interface (its exposed ports, scope != "internal") must be covered
// by its children's combined external interface "不多不少".
//   - uncovered: child has an exposure the parent lacks  → child redundant / parent missing
//   - overreached: parent has an exposure no child has  → interface leak / child under-covers
function externalPortSignature(p: Port): string {
  return `${p.direction}:${p.name}`;
}
function blockExternalPorts(b: FunctionalBlock): Set<string> {
  return new Set(b.ports.filter((p) => (p.scope ?? "external") === "external").map(externalPortSignature));
}

function checkInterfaceConservation(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const blocks = listBlocks(db);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  // group children by parent
  const childrenByParent = new Map<string, FunctionalBlock[]>();
  for (const b of blocks) {
    if (!b.parent_id) continue;
    const arr = childrenByParent.get(b.parent_id) ?? [];
    arr.push(b);
    childrenByParent.set(b.parent_id, arr);
  }
  for (const [pid, children] of childrenByParent) {
    const parent = byId.get(pid);
    if (!parent) continue;
    if (scope && !scope.has(pid)) continue;
    const pPorts = blockExternalPorts(parent);
    const cPorts = new Set<string>();
    for (const c of children) for (const s of blockExternalPorts(c)) cPorts.add(s);
    for (const s of cPorts) {
      if (!pPorts.has(s)) errors.push({ code: "IFACE_UNCOVERED", severity: "error", entity_id: pid, message: `interface "${s}" exposed by child of ${pid} but not by parent ${pid} (child redundant / parent missing)` });
    }
    for (const s of pPorts) {
      if (!cPorts.has(s)) errors.push({ code: "IFACE_OVERREACHED", severity: "error", entity_id: pid, message: `interface "${s}" exposed by parent ${pid} but covered by no child (interface leak / child under-covers)` });
    }
  }
  return errors;
}

// ── V2: Global-state conservation (data-source operations only) ───────────────
// Parent's data_operations = Σ(children's data_operations). Also: every block may only
// touch a DECLARED DataSource (operating an undeclared source is an overreach).
// Access modes form a lattice (read ⊆ read_write, write ⊆ read_write), so conservation
// is compared by CAPABILITY (read/write bits) per data source — a parent that declares
// read_write authorizes a child's read (or write), and a parent's read_write is realized
// once some child reads and some child writes. This avoids false positives when a parent
// declares the max access its subtree needs.
type Cap = "read" | "write";
function accessCaps(a: AccessMode): Cap[] {
  if (a === "read_write") return ["read", "write"];
  return a === "read" ? ["read"] : ["write"];
}
function blockDataOpCaps(b: FunctionalBlock): Set<string> {
  const out = new Set<string>();
  for (const o of (b.data_operations ?? [])) for (const cap of accessCaps(o.access_mode)) out.add(`${o.data_source_id}:${cap}`);
  return out;
}

function checkGlobalStateConservation(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const blocks = listBlocks(db);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const dsIds = new Set(listDataSources(db).map((d) => d.id));

  // 1. every block may only touch declared sources
  for (const b of blocks) {
    if (scope && !scope.has(b.id)) continue;
    for (const op of (b.data_operations ?? [])) {
      if (!dsIds.has(op.data_source_id)) errors.push({ code: "UNKNOWN_DATA_SOURCE", severity: "error", entity_id: b.id, message: `block ${b.id} operates undeclared data source "${op.data_source_id}" (overreach)` });
    }
  }

  // 2. parent data-op capabilities = Σ child data-op capabilities (per source)
  const childrenByParent = new Map<string, FunctionalBlock[]>();
  for (const b of blocks) {
    if (!b.parent_id) continue;
    const arr = childrenByParent.get(b.parent_id) ?? [];
    arr.push(b);
    childrenByParent.set(b.parent_id, arr);
  }
  for (const [pid, children] of childrenByParent) {
    const parent = byId.get(pid);
    if (!parent) continue;
    if (scope && !scope.has(pid)) continue;
    const pCaps = blockDataOpCaps(parent);
    const cCaps = new Set<string>();
    for (const c of children) for (const s of blockDataOpCaps(c)) cCaps.add(s);
    for (const s of cCaps) {
      if (!pCaps.has(s)) errors.push({ code: "GS_OP_UNCOVERED", severity: "error", entity_id: pid, message: `global op "${s}" done by child of ${pid} but not authorized by parent ${pid} (parent missing / child overreach)` });
    }
    for (const s of pCaps) {
      if (!cCaps.has(s)) errors.push({ code: "GS_OP_OVERREACHED", severity: "error", entity_id: pid, message: `global op "${s}" declared by parent ${pid} but done by no child (child under-covers / parent leaks op)` });
    }
  }
  return errors;
}

// ── Local-compile scope: a block's own subtree ids ────────────────────────────
function collectSubtreeIds(db: DatabaseSync, rootId: string): Set<string> {
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    out.add(cur);
    for (const b of listBlocks(db)) if (b.parent_id === cur) stack.push(b.id);
  }
  return out;
}

function compileInternals(db: DatabaseSync, scope?: Set<string>): Diagnostic[] {
  return [
    ...checkTraceability(db, scope),
    ...checkReferenceCompleteness(db, scope),
    ...checkDutyLegality(db, scope),
    ...checkAcyclic(db),
    ...checkInterfaceConservation(db, scope),
    ...checkGlobalStateConservation(db, scope),
  ];
}

export function compileBlockGraph(db: DatabaseSync, opts?: { block_id?: string }): ToolResponse<CompileResult> {
  const errors: Diagnostic[] = opts?.block_id
    ? compileInternals(db, collectSubtreeIds(db, opts.block_id))
    : compileInternals(db);
  const blocks = listBlocks(db);
  return {
    ok: errors.length === 0,
    errors,
    data: {
      block_count: blocks.length,
      trigger_count: (db.prepare(`SELECT COUNT(*) c FROM triggers`).get() as any).c,
      flow_tree_count: (db.prepare(`SELECT COUNT(*) c FROM flow_trees`).get() as any).c,
      accepted: false,
    },
  };
}

// Export a small helper used by query tools.
export function getBlockById(db: DatabaseSync, id: string) {
  return getBlock(db, id);
}
