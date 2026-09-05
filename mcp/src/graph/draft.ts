/**
 * Acceptance-Driven MCP v0.1 — CRUD Service
 * Uses Node's built-in `node:sqlite` DatabaseSync with positional params.
 */
import type { DatabaseSync } from "node:sqlite";
import { sourceRefToString } from "./schema.js";
import type {
  Trigger, TriggerFeedbackTree, FeedbackNode, FunctionalBlock, Port, Dependency, SourceRef,
  DataSource, BlockDataOperation, TriggerTrace, ChangeKind,
} from "./schema.js";

function json<T>(x: T): string {
  if (typeof x === 'string') return x;
  return JSON.stringify(x);
}
function parse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
const DEFAULT_FUNCTION_SPEC = {
  inputs: [], outputs: { type: "unknown", description: "" },
  preconditions: [], postconditions: [], invariants: [], error_handling: {},
};

// Run `fn` inside one SQLite transaction; if it throws, roll back so no partial
// write survives (e.g. a block row + ports when a later dependency insert fails).
function withTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN IMMEDIATE");
  try { fn(); db.exec("COMMIT"); }
  catch (e) { try { db.exec("ROLLBACK"); } catch { /* already rolled back */ } throw e; }
}

// ── V2.1: graph version + change log ─────────────────────────────────────────
export interface ChangeCtx { actor?: string; reason?: string; }

export function getGraphVersion(db: DatabaseSync): number {
  const r = db.prepare(`SELECT value FROM graph_meta WHERE key = 'version'`).get() as any;
  return r ? parseInt(r.value, 10) || 0 : 0;
}

/** Bump the accepted-graph version and return the new value. Called on promote. */
export function bumpGraphVersion(db: DatabaseSync): number {
  const v = getGraphVersion(db) + 1;
  db.prepare(`UPDATE graph_meta SET value = ? WHERE key = 'version'`).run(String(v));
  db.prepare(`UPDATE graph_meta SET value = ? WHERE key = 'updated_at'`).run(new Date().toISOString());
  return v;
}

/** Append a change-log row. graph_version defaults to the current accepted version. */
export function logChange(
  db: DatabaseSync,
  e: { kind: ChangeKind; target_id: string; before?: unknown; after?: unknown; ctx?: ChangeCtx;
        graph_version?: number; compile_passed?: boolean | null; conservation_passed?: boolean | null },
): void {
  const id = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const version = e.graph_version ?? getGraphVersion(db);
  const reason = e.ctx?.reason ?? "";
  db.prepare(`INSERT INTO change_log (id, ts, actor, kind, target_id, before, after, reason, graph_version, compile_passed, conservation_passed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      new Date().toISOString(),
      e.ctx?.actor ?? "structure_agent",
      e.kind,
      e.target_id,
      e.before == null ? null : JSON.stringify(e.before),
      e.after == null ? null : JSON.stringify(e.after),
      reason,
      version,
      e.compile_passed == null ? null : (e.compile_passed ? 1 : 0),
      e.conservation_passed == null ? null : (e.conservation_passed ? 1 : 0),
    );
}

export interface ChangeLogRow {
  id: string; ts: string; actor: string; kind: string; target_id: string;
  before: unknown; after: unknown; reason: string; graph_version: number;
  compile_passed: boolean | null; conservation_passed: boolean | null;
}

export function listChangeLog(db: DatabaseSync, filter?: { actor?: string; kind?: string; target_id?: string }): ChangeLogRow[] {
  let sql = `SELECT * FROM change_log`;
  const conds: string[] = []; const params: string[] = [];
  if (filter?.actor) { conds.push(`actor = ?`); params.push(filter.actor); }
  if (filter?.kind) { conds.push(`kind = ?`); params.push(filter.kind); }
  if (filter?.target_id) { conds.push(`target_id = ?`); params.push(filter.target_id); }
  if (conds.length) sql += ` WHERE ` + conds.join(` AND `);
  sql += ` ORDER BY ts ASC, rowid ASC`;
  return (db.prepare(sql).all(...params) as any[]).map((r) => ({
    id: r.id, ts: r.ts, actor: r.actor, kind: r.kind, target_id: r.target_id,
    before: r.before == null ? null : safeParse(r.before), after: r.after == null ? null : safeParse(r.after),
    reason: r.reason, graph_version: r.graph_version,
    compile_passed: r.compile_passed == null ? null : !!r.compile_passed,
    conservation_passed: r.conservation_passed == null ? null : !!r.conservation_passed,
  }));
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ── Triggers ────────────────────────────────────────────────────────────────
export function createTrigger(db: DatabaseSync, t: Trigger, ctx?: ChangeCtx): void {
  db.prepare(`INSERT INTO triggers (id, name, command, precondition, source) VALUES (?, ?, ?, ?, ?)`)
    .run(t.id, t.name, t.command ?? null, t.precondition ?? null, json(t.source));
  logChange(db, { kind: "create_trigger", target_id: t.id, before: null, after: t, ctx });
}
export function getTrigger(db: DatabaseSync, id: string): Trigger | null {
  const r = db.prepare(`SELECT * FROM triggers WHERE id = ?`).get(id) as any;
  return r ? { id: r.id, name: r.name, command: r.command ?? undefined, precondition: r.precondition ?? undefined, source: parse<SourceRef>(r.source, { kind: "ac", ac_id: "" }) } : null;
}
export function listTriggers(db: DatabaseSync): Trigger[] {
  return (db.prepare(`SELECT * FROM triggers`).all() as any[]).map((r) => ({
    id: r.id, name: r.name, command: r.command ?? undefined, precondition: r.precondition ?? undefined, source: parse<SourceRef>(r.source, { kind: "ac", ac_id: "" }),
  }));
}

// ── Flow trees ──────────────────────────────────────────────────────────────
export function createFlowTree(db: DatabaseSync, t: TriggerFeedbackTree): void {
  db.prepare(`INSERT INTO flow_trees (id, trigger_id, root, source) VALUES (?, ?, ?, ?)`)
    .run(t.id, t.trigger_id, json(t.root), json(t.source));
}
export function getFlowTree(db: DatabaseSync, id: string): TriggerFeedbackTree | null {
  const r = db.prepare(`SELECT * FROM flow_trees WHERE id = ?`).get(id) as any;
  return r ? { id: r.id, trigger_id: r.trigger_id, root: parse<FeedbackNode>(r.root, {} as FeedbackNode), source: parse<SourceRef>(r.source, { kind: "ac", ac_id: "" }) } : null;
}
export function listFlowTrees(db: DatabaseSync): TriggerFeedbackTree[] {
  return (db.prepare(`SELECT * FROM flow_trees`).all() as any[]).map((r) => ({
    id: r.id, trigger_id: r.trigger_id, root: parse<FeedbackNode>(r.root, {} as FeedbackNode), source: parse<SourceRef>(r.source, { kind: "ac", ac_id: "" }),
  }));
}

// ── Blocks ──────────────────────────────────────────────────────────────────
// Lower-level port/dep inserts WITHOUT change-logging (used inside createBlock /
// updateBlock transactions so a single block-level change is logged once, not per
// nested row). Public addPort/addDependency (used by record_port/connect_dependency)
// wrap these and log a change.
function _addPortRaw(db: DatabaseSync, p: Port): void {
  db.prepare(`INSERT INTO ports (id, block_id, name, direction, contract, scope) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(p.id, p.block_id, p.name, p.direction, p.contract, p.scope ?? "external");
}
function _addDepRaw(db: DatabaseSync, d: Dependency): void {
  db.prepare(`INSERT INTO deps (id, source_block_id, target_block_id, via_port, protocol, source) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(d.id, d.source_block_id, d.target_block_id, d.via_port ?? null, d.protocol ?? "unknown", json(d.source ?? { kind: "ac", ac_id: "" }));
}

export function createBlock(db: DatabaseSync, b: FunctionalBlock, ctx?: ChangeCtx): void {
  // node:sqlite binds only null (not undefined) for nullable/optional columns.
  // Atomic: block row + ports + deps in ONE transaction; if any insert fails
  // (e.g. a malformed dep), roll back everything so no partial block survives.
  withTransaction(db, () => {
    db.prepare(`INSERT INTO blocks (id, parent_id, name, purpose, function_spec, boundary, data_operations, source, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        b.id,
        b.parent_id ?? null,
        b.name,
        b.purpose ?? "",
        json(b.function_spec ?? DEFAULT_FUNCTION_SPEC),
        json(b.boundary ?? { in_scope: [], out_of_scope: [] }),
        json(b.data_operations ?? []),
        json(b.source ?? { kind: "ac", ac_id: "" }),
        b.status ?? "draft",
      );
    for (const p of (b.ports ?? [])) _addPortRaw(db, p);
    for (const d of (b.deps ?? [])) _addDepRaw(db, d);
    logChange(db, { kind: "create_block", target_id: b.id, before: null, after: b, ctx });
  });
}

export function addPort(db: DatabaseSync, p: Port, ctx?: ChangeCtx): void {
  _addPortRaw(db, p);
  logChange(db, { kind: "add_port", target_id: p.id, before: null, after: p, ctx });
}
export function addDependency(db: DatabaseSync, d: Dependency, ctx?: ChangeCtx): void {
  _addDepRaw(db, d);
  logChange(db, { kind: "add_dep", target_id: d.id, before: null, after: d, ctx });
}
export function getBlock(db: DatabaseSync, id: string): FunctionalBlock | null {
  const r = db.prepare(`SELECT * FROM blocks WHERE id = ?`).get(id) as any;
  if (!r) return null;
  const ports = (db.prepare(`SELECT * FROM ports WHERE block_id = ?`).all(id) as any[]).map((p) => ({
    id: p.id, block_id: p.block_id, name: p.name, direction: p.direction as "in" | "out", contract: p.contract, scope: (p.scope ?? "external") as "external" | "internal",
  }));
  const deps = (db.prepare(`SELECT * FROM deps WHERE source_block_id = ? OR target_block_id = ?`).all(id, id) as any[]).map((d) => ({
    id: d.id, source_block_id: d.source_block_id, target_block_id: d.target_block_id, via_port: d.via_port ?? undefined, protocol: d.protocol, source: parse<SourceRef>(d.source, { kind: "ac", ac_id: "" }),
  }));
  return {
    id: r.id, name: r.name, purpose: r.purpose, parent_id: r.parent_id,
    function_spec: parse(r.function_spec, DEFAULT_FUNCTION_SPEC), boundary: parse(r.boundary, { in_scope: [], out_of_scope: [] }),
    data_operations: parse<BlockDataOperation[]>(r.data_operations, []), source: parse<SourceRef>(r.source, { kind: "ac", ac_id: "" }),
    status: r.status, ports, deps,
  };
}
export function listBlocks(db: DatabaseSync): FunctionalBlock[] {
  return (db.prepare(`SELECT id FROM blocks`).all() as any[]).map((r) => getBlock(db, r.id)).filter(Boolean) as FunctionalBlock[];
}
export function setBlockStatus(db: DatabaseSync, id: string, status: string): void {
  db.prepare(`UPDATE blocks SET status = ? WHERE id = ?`).run(status, id);
}

// ── Update (in-place, for reviewer-feedback revisions) ───────────────────────
// Only override patch fields that are actually defined (undefined = leave as-is),
// so a partial update doesn't clobber existing values.
export function updateTrigger(db: DatabaseSync, id: string, patch: Partial<Trigger>, ctx?: ChangeCtx): boolean {
  const t = getTrigger(db, id); if (!t) return false;
  const m: any = { ...t };
  if (patch.name !== undefined) m.name = patch.name;
  if (patch.command !== undefined) m.command = patch.command;
  if (patch.precondition !== undefined) m.precondition = patch.precondition;
  if (patch.source !== undefined) m.source = patch.source;
  db.prepare(`UPDATE triggers SET name=?, command=?, precondition=?, source=? WHERE id=?`)
    .run(m.name, m.command ?? null, m.precondition ?? null, json(m.source), id);
  logChange(db, { kind: "update_trigger", target_id: id, before: t, after: m, ctx });
  return true;
}

export function updateDataSource(db: DatabaseSync, id: string, patch: Partial<DataSource>, ctx?: ChangeCtx): boolean {
  const d = getDataSource(db, id); if (!d) return false;
  const m: any = { ...d };
  if (patch.name !== undefined) m.name = patch.name;
  if (patch.category !== undefined) m.category = patch.category;
  if (patch.access_mode !== undefined) m.access_mode = patch.access_mode;
  if (patch.entities !== undefined) m.entities = patch.entities;
  if (patch.operations !== undefined) m.operations = patch.operations;
  db.prepare(`UPDATE data_sources SET name=?, category=?, access_mode=?, entities=?, operations=? WHERE id=?`)
    .run(m.name, m.category, m.access_mode, json(m.entities ?? []), json(m.operations ?? []), id);
  logChange(db, { kind: "update_data_source", target_id: id, before: d, after: m, ctx });
  return true;
}

// Update a block in place. Any edit "un-freezes" the block → status "draft", so it
// must be recompiled + re-promoted (preserves the draft→compile→promote state machine).
// If patch provides ports / deps, that block's own ports / outgoing deps are replaced
// atomically; otherwise left intact. Returns false if the block doesn't exist.
export function updateBlock(db: DatabaseSync, id: string, patch: Partial<FunctionalBlock>, ctx?: ChangeCtx): boolean {
  const b = getBlock(db, id); if (!b) return false;
  const m: any = { ...b };
  if (patch.name !== undefined) m.name = patch.name;
  if (patch.purpose !== undefined) m.purpose = patch.purpose;
  if (patch.parent_id !== undefined) m.parent_id = patch.parent_id;
  if (patch.function_spec !== undefined) m.function_spec = patch.function_spec;
  if (patch.boundary !== undefined) m.boundary = patch.boundary;
  if (patch.data_operations !== undefined) m.data_operations = patch.data_operations;
  if (patch.source !== undefined) m.source = patch.source;
  if (patch.ports !== undefined) m.ports = patch.ports;
  if (patch.deps !== undefined) m.deps = patch.deps;
  const kind: ChangeKind = (patch.parent_id !== undefined && patch.parent_id !== b.parent_id) ? "reparent_block" : "update_block";
  withTransaction(db, () => {
    db.prepare(`UPDATE blocks SET name=?, purpose=?, parent_id=?, function_spec=?, boundary=?, data_operations=?, source=?, status=? WHERE id=?`)
      .run(m.name, m.purpose ?? "", m.parent_id ?? null, json(m.function_spec ?? DEFAULT_FUNCTION_SPEC), json(m.boundary ?? { in_scope: [], out_of_scope: [] }), json(m.data_operations ?? []), json(m.source ?? { kind: "ac", ac_id: "" }), "draft", id);
    if (patch.ports !== undefined) {
      db.prepare(`DELETE FROM ports WHERE block_id = ?`).run(id);
      for (const p of (m.ports ?? [])) _addPortRaw(db, { ...p, block_id: id });
    }
    if (patch.deps !== undefined) {
      db.prepare(`DELETE FROM deps WHERE source_block_id = ?`).run(id);
      for (const d of (m.deps ?? [])) _addDepRaw(db, { ...d });
    }
    logChange(db, { kind, target_id: id, before: b, after: m, ctx });
  });
  return true;
}

// ── Data sources (V2: global state sources) ──────────────────────────────────
export function createDataSource(db: DatabaseSync, d: DataSource, ctx?: ChangeCtx): void {
  db.prepare(`INSERT INTO data_sources (id, name, category, access_mode, entities, operations)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(d.id, d.name, d.category, d.access_mode, json(d.entities ?? []), json(d.operations ?? []));
  logChange(db, { kind: "create_data_source", target_id: d.id, before: null, after: d, ctx });
}
export function getDataSource(db: DatabaseSync, id: string): DataSource | null {
  const r = db.prepare(`SELECT * FROM data_sources WHERE id = ?`).get(id) as any;
  if (!r) return null;
  return { id: r.id, name: r.name, category: r.category, access_mode: r.access_mode, entities: parse<string[]>(r.entities, []), operations: parse<string[]>(r.operations, []) };
}
export function listDataSources(db: DatabaseSync): DataSource[] {
  return (db.prepare(`SELECT * FROM data_sources`).all() as any[]).map((r) => ({
    id: r.id, name: r.name, category: r.category, access_mode: r.access_mode, entities: parse<string[]>(r.entities, []), operations: parse<string[]>(r.operations, []),
  }));
}

// ── Trigger traces (V2: trigger → block edges) ──────────────────────────────
export function createTriggerTrace(db: DatabaseSync, t: TriggerTrace): void {
  db.prepare(`INSERT INTO trigger_traces (id, trigger_id, target_block_id, effect, data_source_effects, branch, parent_trace_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(t.id, t.trigger_id, t.target_block_id, t.effect ?? "", json(t.data_source_effects ?? []), t.branch ?? "normal", t.parent_trace_id ?? null);
}
export function getTriggerTrace(db: DatabaseSync, id: string): TriggerTrace | null {
  const r = db.prepare(`SELECT * FROM trigger_traces WHERE id = ?`).get(id) as any;
  if (!r) return null;
  return { id: r.id, trigger_id: r.trigger_id, target_block_id: r.target_block_id, effect: r.effect, data_source_effects: parse<string[]>(r.data_source_effects, []), branch: r.branch, parent_trace_id: r.parent_trace_id ?? undefined };
}
export function listTriggerTraces(db: DatabaseSync): TriggerTrace[] {
  return (db.prepare(`SELECT * FROM trigger_traces`).all() as any[]).map((r) => ({
    id: r.id, trigger_id: r.trigger_id, target_block_id: r.target_block_id, effect: r.effect, data_source_effects: parse<string[]>(r.data_source_effects, []), branch: r.branch, parent_trace_id: r.parent_trace_id ?? undefined,
  }));
}
/** Expand a trigger into its call tree (trigger → block → children → data-source effects, incl. error branches). */
export function queryTriggerTraceTree(db: DatabaseSync, triggerId: string): { trigger_id: string; nodes: TriggerTrace[] } {
  const all = listTriggerTraces(db).filter((t) => t.trigger_id === triggerId);
  return { trigger_id: triggerId, nodes: all };
}

// ── PRD-binding coverage query (AC/FR → trigger → block) ─────────────────────
// Reverse-lookup from the SourceRef traceability: which acceptance/requirement
// entries actually have a trigger bound to them, and which blocks that trigger
// is traced to. Agent compares this matrix against the PRD's full AC/FR list to
// find uncovered entries (acceptances with no trigger = a dropped requirement).
export interface RequirementsCoverage {
  requirements: Array<{
    kind: "ac" | "fr" | "other";
    ref_id: string;
    coverage: "covered" | "uncovered";
    triggers: Array<{
      trigger_id: string;
      trigger_name: string;
      blocks: string[];   // blocks this trigger is traced to (from trigger_traces)
    }>;
  }>;
  covered: number;
  uncovered: number;
  total: number;
}

export function getRequirementsCoverage(db: DatabaseSync): RequirementsCoverage {
  const triggers = listTriggers(db);
  const traces = listTriggerTraces(db);

  // Map a SourceRef to a requirement key. Only ac/fr are PRD acceptances;
  // derived/trigger/flow_node sources are not themselves acceptance entries.
  function reqKey(s: SourceRef): { kind: "ac" | "fr"; ref_id: string } | null {
    if (s.kind === "ac") return { kind: "ac", ref_id: s.ac_id };
    if (s.kind === "fr") return { kind: "fr", ref_id: s.fr_id };
    return null; // derived/trigger/flow_node are not PRD acceptances
  }

  const byKey = new Map<string, { kind: "ac" | "fr"; ref_id: string; triggers: RequirementsCoverage["requirements"][number]["triggers"] }>();
  const order: string[] = [];

  for (const t of triggers) {
    const r = reqKey(t.source);
    if (!r) continue;
    const key = `${r.kind}:${r.ref_id}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { kind: r.kind, ref_id: r.ref_id, triggers: [] };
      byKey.set(key, entry);
      order.push(key);
    }
    const blocks = traces.filter((tr) => tr.trigger_id === t.id).map((tr) => tr.target_block_id);
    entry.triggers.push({ trigger_id: t.id, trigger_name: t.name, blocks });
  }

  const requirements = order.map((key) => {
    const e = byKey.get(key)!;
    return {
      kind: e.kind,
      ref_id: e.ref_id,
      coverage: e.triggers.length > 0 ? ("covered" as const) : ("uncovered" as const),
      triggers: e.triggers,
    };
  });
  const covered = requirements.filter((r) => r.coverage === "covered").length;
  return { requirements, covered, uncovered: requirements.length - covered, total: requirements.length };
}

// ── State machine: promote + snapshot ────────────────────────────────────────
export function promoteBlock(db: DatabaseSync, id: string, ctx?: ChangeCtx): boolean {
  const b = getBlock(db, id);
  if (!b) return false;
  setBlockStatus(db, id, "accepted");
  const v = bumpGraphVersion(db);
  logChange(db, { kind: "promote_block", target_id: id, before: b.status, after: "accepted", graph_version: v, ctx });
  return true;
}
export function createSnapshot(db: DatabaseSync, gitSha: string, version: string): void {
  const id = `snap-${Date.now()}`;
  db.prepare(`INSERT INTO snapshots (id, git_sha, created_at, version) VALUES (?, ?, ?, ?)`)
    .run(id, gitSha, new Date().toISOString(), version);
}

// ── Reset ───────────────────────────────────────────────────────────────────
export function resetAll(db: DatabaseSync): void {
  // Delete in FK-safe order: referencing tables first, referenced tables last.
  db.exec(`
    DELETE FROM trigger_traces;
    DELETE FROM deps;
    DELETE FROM ports;
    DELETE FROM flow_trees;
    DELETE FROM blocks;
    DELETE FROM triggers;
    DELETE FROM data_sources;
  `);
  // Full wipe also clears the evolution log and resets the accepted-graph version.
  db.exec(`DELETE FROM change_log`);
  db.prepare(`UPDATE graph_meta SET value = '0' WHERE key = 'version'`).run();
  db.prepare(`UPDATE graph_meta SET value = ? WHERE key = 'updated_at'`).run(new Date().toISOString());
}

/** Light reset: delete only draft-status blocks and their dependent records,
 *  preserving accepted blocks (and the triggers/data-sources they reference). */
export function resetDrafts(db: DatabaseSync): void {
  const draftIds = listBlocks(db).filter((b) => b.status === "draft").map((b) => b.id);
  if (draftIds.length === 0) return;
  const ph = draftIds.map((_) => "?").join(",");
  // Referencing tables first (FK-safe), then the draft blocks themselves.
  // Flow trees / triggers / data sources are NOT draft-block-owned; leave them.
  db.prepare(`DELETE FROM trigger_traces WHERE target_block_id IN (${ph})`).run(...draftIds);
  db.prepare(`DELETE FROM deps WHERE source_block_id IN (${ph}) OR target_block_id IN (${ph})`).run(...draftIds);
  db.prepare(`DELETE FROM ports WHERE block_id IN (${ph})`).run(...draftIds);
  // Detach any block (accepted or draft) whose parent is a draft block, so the
  // blocks.parent_id self-FK doesn't block deleting the draft parents. Accepted
  // children survive as top-level roots.
  db.prepare(`UPDATE blocks SET parent_id = NULL WHERE parent_id IN (${ph})`).run(...draftIds);
  db.prepare(`DELETE FROM blocks WHERE id IN (${ph})`).run(...draftIds);
}

// ── V2.1: deletes + fine-grained revert (from the change log) ─────────────────
export function deletePort(db: DatabaseSync, id: string, ctx?: ChangeCtx): void {
  const before = (db.prepare(`SELECT * FROM ports WHERE id = ?`).get(id) as any) ?? null;
  db.prepare(`DELETE FROM ports WHERE id = ?`).run(id);
  logChange(db, { kind: "restore", target_id: id, before, after: null, ctx: ctx ?? { actor: "revert", reason: "delete_port" } });
}
export function deleteDep(db: DatabaseSync, id: string, ctx?: ChangeCtx): void {
  const before = (db.prepare(`SELECT * FROM deps WHERE id = ?`).get(id) as any) ?? null;
  db.prepare(`DELETE FROM deps WHERE id = ?`).run(id);
  logChange(db, { kind: "restore", target_id: id, before, after: null, ctx: ctx ?? { actor: "revert", reason: "delete_dep" } });
}
/** Delete a block (FK-safe: clean referencing rows, detach accepted children). */
export function deleteBlock(db: DatabaseSync, id: string, ctx?: ChangeCtx): boolean {
  if (!getBlock(db, id)) return false;
  const before = getBlock(db, id);
  withTransaction(db, () => {
    db.prepare(`DELETE FROM trigger_traces WHERE target_block_id = ?`).run(id);
    db.prepare(`DELETE FROM deps WHERE source_block_id = ? OR target_block_id = ?`).run(id, id);
    db.prepare(`DELETE FROM ports WHERE block_id = ?`).run(id);
    db.prepare(`UPDATE blocks SET parent_id = NULL WHERE parent_id = ?`).run(id);
    db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
    logChange(db, { kind: "delete_block", target_id: id, before, after: null, ctx });
  });
  return true;
}

/** Fine-grained revert: restore the `before` of a single change (rollback a bad edit). */
export function revertChange(db: DatabaseSync, changeId: string, ctx?: ChangeCtx): boolean {
  const row = db.prepare(`SELECT * FROM change_log WHERE id = ?`).get(changeId) as any;
  if (!row) return false;
  const kind = row.kind as ChangeKind;
  const target = row.target_id;
  const before = row.before == null ? null : safeParse(row.before);
  const after = row.after == null ? null : safeParse(row.after);
  const rctx: ChangeCtx = ctx ?? { actor: "revert", reason: "revert:" + changeId };
  switch (kind) {
    case "create_block": deleteBlock(db, target, rctx); break;
    case "update_block":
    case "reparent_block": {
      const b = before as FunctionalBlock;
      if (b && getBlock(db, target)) {
        updateBlock(db, target, { name: b.name, purpose: b.purpose, parent_id: b.parent_id, function_spec: b.function_spec, boundary: b.boundary, data_operations: b.data_operations, source: b.source, ports: b.ports, deps: b.deps }, rctx);
      }
      break;
    }
    case "add_port": deletePort(db, target, rctx); break;
    case "add_dep": deleteDep(db, target, rctx); break;
    case "promote_block": setBlockStatus(db, target, "draft"); break;
    case "update_trigger": { const t = before as any; if (t) updateTrigger(db, target, t, rctx); break; }
    case "update_data_source": { const d = before as any; if (d) updateDataSource(db, target, d, rctx); break; }
    default: break; // create_trigger / create_data_source / delete_block: no cheap inverse
  }
  logChange(db, { kind: "restore", target_id: target, before: after, after: before, ctx: rctx });
  return true;
}
