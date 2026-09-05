/**
 * Acceptance-Driven MCP v0.1 — Tool Handlers
 * All handlers return structured ToolResponse.
 */
import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { openStore, closeStore } from "../graph/store.js";
import * as draft from "../graph/draft.js";
import { compileBlockGraph } from "../graph/compiler.js";
import type {
  Trigger, TriggerFeedbackTree, FunctionalBlock, Port, Dependency, DataSource, TriggerTrace,
  ToolResponse, Diagnostic,
} from "../graph/schema.js";

export interface ToolContext {
  db: DatabaseSync | null;
  repoPath: string;
}

export function newContext(repoPath = process.cwd()): ToolContext {
  return { db: null, repoPath };
}

// Persist the last-used repo path in the server store dir, so a later
// begin_initialization{} (no repo_path) reuses it instead of silently opening a
// different (empty) store — this is why decomposition "looked lost" across restarts
// when the agent forgot to pass repo_path.
function serverStoreDir(): string { return path.join(process.cwd(), ".acceptance"); }
function readLastRepo(): string | null {
  try {
    const p = path.join(serverStoreDir(), ".last-repo");
    if (fs.existsSync(p)) { const s = fs.readFileSync(p, "utf8").trim(); return s || null; }
  } catch { /* ignore */ }
  return null;
}
function writeLastRepo(repoPath: string): void {
  try {
    fs.mkdirSync(serverStoreDir(), { recursive: true });
    fs.writeFileSync(path.join(serverStoreDir(), ".last-repo"), repoPath);
  } catch { /* ignore */ }
}

// Validate + normalize a block's ports and deps before insert, so malformed
// agent input yields a clear, instructive error instead of a raw SQLite bind /
// UNIQUE crash — and no partial write (createBlock is atomic).
function normalizePorts(blockId: string, ports: unknown): { ok: true; ports: Port[] } | { ok: false; errors: Diagnostic[] } {
  if (ports == null) return { ok: true, ports: [] };
  if (!Array.isArray(ports)) return { ok: false, errors: [{ code: "INVALID_PORTS", severity: "error", message: "ports must be an array of port objects" }] };
  const out: Port[] = [];
  for (let i = 0; i < ports.length; i++) {
    const p = ports[i] as any;
    if (!p || typeof p !== "object") return { ok: false, errors: [{ code: "INVALID_PORT", severity: "error", message: `ports[${i}] must be an object {id?, name, direction, contract?, scope?}` }] };
    if (!p.name || !["in", "out"].includes(p.direction)) return { ok: false, errors: [{ code: "INVALID_PORT", severity: "error", message: `ports[${i}] needs name and direction ("in"|"out")` }] };
    out.push({ id: p.id ?? `${blockId}_port_${i}`, block_id: blockId, name: p.name, direction: p.direction, contract: p.contract ?? "", scope: p.scope ?? "external" });
  }
  return { ok: true, ports: out };
}

function normalizeDeps(blockId: string, deps: unknown): { ok: true; deps: Dependency[] } | { ok: false; errors: Diagnostic[] } {
  if (deps == null) return { ok: true, deps: [] };
  if (!Array.isArray(deps)) return { ok: false, errors: [{ code: "INVALID_DEPS", severity: "error", message: "deps must be an array of dependency objects" }] };
  const out: Dependency[] = [];
  for (let i = 0; i < deps.length; i++) {
    const d = deps[i] as any;
    if (!d || typeof d !== "object") {
      // A bare string is the LLM-natural default but is directionless — reject with education.
      return { ok: false, errors: [{ code: "INVALID_DEP", severity: "error", message: `deps[${i}] must be a directed dependency object {id?, source_block_id, target_block_id, protocol?, source?} — a bare string (${typeof d}) has no direction; use an object to express which block depends on which.` }] };
    }
    if (!d.source_block_id || !d.target_block_id) return { ok: false, errors: [{ code: "INVALID_DEP", severity: "error", message: `deps[${i}] needs source_block_id and target_block_id (a directed dependency)` }] };
    out.push({ id: d.id ?? `${blockId}_dep_${i}`, source_block_id: d.source_block_id, target_block_id: d.target_block_id, via_port: d.via_port, protocol: d.protocol ?? "unknown", source: d.source ?? { kind: "ac", ac_id: "" } });
  }
  return { ok: true, deps: out };
}

function err<T>(message: string, code = "INVALID_INPUT"): ToolResponse<T> {
  return { ok: false, errors: [{ code, severity: "error", message } satisfies Diagnostic] };
}
function requireDb(ctx: ToolContext): DatabaseSync | null {
  if (!ctx.db) { return null; }
  return ctx.db;
}
/** Create/reconnect the store for the working directory. */
export function handleBeginInitialization(args: { repo_path?: string }, ctx: ToolContext): ToolResponse<{ repo_path: string; session: string }> {
  const repoPath = args.repo_path ?? readLastRepo() ?? ctx.repoPath ?? process.cwd();
  if (ctx.db) closeStore(ctx.db);
  ctx.db = openStore(repoPath);
  ctx.repoPath = repoPath;
  writeLastRepo(repoPath);
  return { ok: true, data: { repo_path: repoPath, session: "acceptance-driven" } };
}
export function handleSessionStatus(_a: unknown, ctx: ToolContext): ToolResponse<{ active: boolean; repo_path: string }> {
  return { ok: true, data: { active: ctx.db !== null, repo_path: ctx.repoPath } };
}
export function handleReset(args: { mode?: "all" | "drafts" }, ctx: ToolContext): ToolResponse<{ reset: boolean; mode: "all" | "drafts" }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  const mode = args.mode ?? "all";
  if (mode === "drafts") draft.resetDrafts(db); else draft.resetAll(db);
  return { ok: true, data: { reset: true, mode } };
}

// ── Triggers ────────────────────────────────────────────────────────────────
export function handleRecordTrigger(args: Trigger, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.name || !args.source) return err("trigger needs id/name/source");
  draft.createTrigger(db, args);
  return { ok: true, data: { id: args.id } };
}

// ── Flow trees ──────────────────────────────────────────────────────────────
export function handleRecordFlowTree(args: TriggerFeedbackTree, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.root) return err("flow tree needs id/root");
  draft.createFlowTree(db, args);
  return { ok: true, data: { id: args.id } };
}

// ── Blocks ──────────────────────────────────────────────────────────────────
export function handleProposeBlock(args: FunctionalBlock, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.name || !args.source) return err("block needs id/name/source");
  if (draft.getBlock(db, args.id)) return err(`block "${args.id}" already exists; propose_block is create-only — pick a new id, or reset{mode:"drafts"} to discard it first`, "BLOCK_EXISTS");
  const np = normalizePorts(args.id, args.ports); if (!np.ok) return { ok: false, errors: np.errors };
  const nd = normalizeDeps(args.id, args.deps); if (!nd.ok) return { ok: false, errors: nd.errors };
  const block: FunctionalBlock = { ...args, ports: np.ports, deps: nd.deps, data_operations: args.data_operations ?? [], status: args.status ?? "draft" };
  draft.createBlock(db, block);
  return { ok: true, data: { id: args.id } };
}
export function handleUpdateBlock(args: FunctionalBlock & { id: string }, ctx: ToolContext): ToolResponse<{ id: string; status: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id) return err("update_block needs id");
  if (!draft.getBlock(db, args.id)) return err(`block "${args.id}" not found`, "NOT_FOUND");
  const np = args.ports === undefined ? null : normalizePorts(args.id, args.ports); if (np && !np.ok) return { ok: false, errors: np.errors };
  const nd = args.deps === undefined ? null : normalizeDeps(args.id, args.deps); if (nd && !nd.ok) return { ok: false, errors: nd.errors };
  const patch: Partial<FunctionalBlock> = { ...args };
  if (np) patch.ports = np.ports;
  if (nd) patch.deps = nd.deps;
  draft.updateBlock(db, args.id, patch);
  return { ok: true, data: { id: args.id, status: "draft" } };
}
export function handleUpdateTrigger(args: Partial<Trigger> & { id: string }, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id) return err("update_trigger needs id");
  if (!draft.updateTrigger(db, args.id, args)) return err(`trigger "${args.id}" not found`, "NOT_FOUND");
  return { ok: true, data: { id: args.id } };
}
export function handleUpdateDataSource(args: Partial<DataSource> & { id: string }, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id) return err("update_data_source needs id");
  if (!draft.updateDataSource(db, args.id, args)) return err(`data source "${args.id}" not found`, "NOT_FOUND");
  return { ok: true, data: { id: args.id } };
}
export function handleRecordPort(args: Port, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.block_id) return err("port needs id/block_id");
  draft.addPort(db, args);
  return { ok: true, data: { id: args.id } };
}
export function handleConnectDependency(args: Dependency, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.source_block_id || !args.target_block_id) return err("dep needs id/source/target");
  draft.addDependency(db, args);
  return { ok: true, data: { id: args.id } };
}

// ── Compile ─────────────────────────────────────────────────────────────────
export function handleCompileBlockGraph(args: { block_id?: string }, ctx: ToolContext): ToolResponse {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return compileBlockGraph(db, args?.block_id ? { block_id: args.block_id } : undefined);
}

// ── V2: Data sources (global state) ──────────────────────────────────────────
export function handleRecordDataSource(args: DataSource, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.name || !args.category || !args.access_mode) return err("data source needs id/name/category/access_mode");
  draft.createDataSource(db, args);
  return { ok: true, data: { id: args.id } };
}
export function handleListDataSources(_a: unknown, ctx: ToolContext): ToolResponse<DataSource[]> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.listDataSources(db) };
}

// ── V2: Trigger traces (trigger → block edges) ───────────────────────────────
export function handleRecordTriggerTrace(args: TriggerTrace, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.id || !args.trigger_id || !args.target_block_id) return err("trigger trace needs id/trigger_id/target_block_id");
  draft.createTriggerTrace(db, args);
  return { ok: true, data: { id: args.id } };
}
export function handleQueryTriggerTrace(args: { trigger_id: string }, ctx: ToolContext): ToolResponse<{ trigger_id: string; nodes: TriggerTrace[] }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  if (!args.trigger_id) return err("trigger trace query needs trigger_id");
  return { ok: true, data: draft.queryTriggerTraceTree(db, args.trigger_id) };
}
export function handleListTriggerTraces(_a: unknown, ctx: ToolContext): ToolResponse<TriggerTrace[]> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.listTriggerTraces(db) };
}

// ── V2: State machine (draft → compile → promote → snapshot) ─────────────────
export function handlePromoteBlock(args: { block_id: string }, ctx: ToolContext): ToolResponse<{ id: string; status: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  const ok = args.block_id ? draft.promoteBlock(db, args.block_id) : false;
  if (!ok) return err("block not found", "NOT_FOUND");
  return { ok: true, data: { id: args.block_id, status: "accepted" } };
}
export function handleCommitSnapshot(args: { git_sha?: string; version?: string }, ctx: ToolContext): ToolResponse<{ id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  draft.createSnapshot(db, args.git_sha ?? "unknown", args.version ?? "v1");
  return { ok: true, data: { id: `snap-${Date.now()}` } };
}

// ── V2.1: graph version + change log (evolution / mutation audit) ─────────────
export function handleGetGraphVersion(_a: unknown, ctx: ToolContext): ToolResponse<{ version: number }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: { version: draft.getGraphVersion(db) } };
}
export function handleListChangeLog(args: { actor?: string; kind?: string; target_id?: string }, ctx: ToolContext): ToolResponse<{ version: number; changes: ReturnType<typeof draft.listChangeLog> }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: { version: draft.getGraphVersion(db), changes: draft.listChangeLog(db, args) } };
}
export function handleRevertChange(args: { change_id: string; reason?: string }, ctx: ToolContext): ToolResponse<{ ok: boolean; change_id: string }> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  const ok = draft.revertChange(db, args.change_id, { actor: "revert", reason: args.reason ?? "" });
  if (!ok) return err(`change "${args.change_id}" not found`, "NOT_FOUND");
  return { ok: true, data: { ok: true, change_id: args.change_id } };
}

// ── Query (inspection) ──────────────────────────────────────────────────────
export function handleListBlocks(_a: unknown, ctx: ToolContext): ToolResponse<FunctionalBlock[]> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.listBlocks(db) };
}
export function handleQueryBlock(args: { block_id: string }, ctx: ToolContext): ToolResponse<FunctionalBlock> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  const b = args.block_id ? draft.getBlock(db, args.block_id) : null;
  if (!b) return err("block not found", "NOT_FOUND");
  return { ok: true, data: b };
}
export function handleQueryFlowTree(args: { tree_id: string }, ctx: ToolContext): ToolResponse<TriggerFeedbackTree> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  const t = args.tree_id ? draft.getFlowTree(db, args.tree_id) : null;
  if (!t) return err("flow tree not found", "NOT_FOUND");
  return { ok: true, data: t };
}
export function handleListFlowTrees(_a: unknown, ctx: ToolContext): ToolResponse<TriggerFeedbackTree[]> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.listFlowTrees(db) };
}
export function handleListTriggers(_a: unknown, ctx: ToolContext): ToolResponse<Trigger[]> {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.listTriggers(db) };
}

// ── PRD-binding coverage (AC/FR → trigger → block) ──────────────────────────
export function handleQueryRequirementsCoverage(_a: unknown, ctx: ToolContext): ToolResponse {
  const db = requireDb(ctx); if (!db) return err("not initialized");
  return { ok: true, data: draft.getRequirementsCoverage(db) };
}

export const _internal = { path, draft };
