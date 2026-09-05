import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { openStore, closeStore, deleteStore } from "../src/graph/store.js";
import { createTrigger, createFlowTree, createBlock, getBlock, listBlocks, resetAll, createDataSource, createTriggerTrace, promoteBlock, listDataSources, getRequirementsCoverage, resetDrafts, updateBlock, updateTrigger, updateDataSource, addPort, addDependency, getGraphVersion, listChangeLog, revertChange } from "../src/graph/draft.js";
import { newContext, handleBeginInitialization, handleProposeBlock } from "../src/mcp/tools.js";
import { compileBlockGraph } from "../src/graph/compiler.js";
import { sourceRefToString } from "../src/graph/schema.js";
import type { Trigger, TriggerFeedbackTree, FeedbackNode, FunctionalBlock, Port } from "../src/graph/schema.js";

const dir = path.join(os.tmpdir(), "acceptance-test-" + Date.now());

describe("acceptance-driven store/draft", () => {
  let db: ReturnType<typeof openStore>;

  beforeEach(() => { db = openStore(dir); });
  afterEach(() => { closeStore(db); deleteStore(dir); });

  it("create/get trigger and flow tree round-trip", () => {
    const t: Trigger = { id: "t1", name: "create task", source: { kind: "ac", ac_id: "AC-001" } };
    createTrigger(db, t);
    const got = (db.prepare("SELECT * FROM triggers").all() as any[]);
    expect(got).toHaveLength(1);

    const root: FeedbackNode = { id: "n1", type: "feedback_leaf", feedback_type: "success", message: "ok", source: { kind: "flow_node", node_id: "n1" } };
    const tree: TriggerFeedbackTree = { id: "ft1", trigger_id: "t1", root, source: { kind: "ac", ac_id: "AC-001" } };
    createFlowTree(db, tree);
    const ft = (db.prepare("SELECT * FROM flow_trees").all() as any[]);
    expect(ft).toHaveLength(1);
  });

  it("compile accepts a valid block", () => {
    createTrigger(db, { id: "t1", name: "create task", source: { kind: "ac", ac_id: "AC-001" } });
    const root: FeedbackNode = { id: "n1", type: "feedback_leaf", feedback_type: "success", message: "ok", source: { kind: "flow_node", node_id: "n1" } };
    createFlowTree(db, { id: "ft1", trigger_id: "t1", root, source: { kind: "ac", ac_id: "AC-001" } });
    const block: FunctionalBlock = {
      id: "b1", name: "create_task", purpose: "create", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "Task", description: "task" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: ["create"], out_of_scope: ["list"] }, ports: [], deps: [], data_operations: [],
      source: { kind: "derived", from: [{ kind: "flow_node", node_id: "n1" }], reason: "agg" }, status: "draft",
    };
    createBlock(db, block);
    const res = compileBlockGraph(db);
    expect(res.ok).toBe(true);
    expect(res.errors ?? []).toHaveLength(0);
    expect(listBlocks(db)).toHaveLength(1);
    expect(getBlock(db, "b1")?.id).toBe("b1");
  });

  it("compile rejects a block with unknown data source op", () => {
    const block: FunctionalBlock = {
      id: "b1", name: "create_task", purpose: "create", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "Task", description: "task" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: ["create"], out_of_scope: [] }, ports: [], deps: [],
      data_operations: [{ data_source_id: "phantom_db", access_mode: "read" }], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    createBlock(db, block);
    const res = compileBlockGraph(db);
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "UNKNOWN_DATA_SOURCE")).toBe(true);
  });

  it("interface conservation flags uncovered and overreached", () => {
    createDataSource(db, { id: "ds1", name: "db", category: "db", access_mode: "read_write", entities: [], operations: [] });
    // parent exposes "out:out1"; child-1 exposes "out:out1" (covered) and child-2 exposes "in:x" (uncovered)
    const parent: FunctionalBlock = {
      id: "parent", name: "p", purpose: "p", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [
        { id: "po1", block_id: "parent", name: "out1", direction: "out", contract: "", scope: "external" },
      ], deps: [], data_operations: [{ data_source_id: "ds1", access_mode: "read" }], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    const child1: FunctionalBlock = {
      id: "c1", name: "c1", purpose: "c1", parent_id: "parent",
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [
        { id: "c1o", block_id: "c1", name: "out1", direction: "out", contract: "", scope: "external" },
      ], deps: [], data_operations: [{ data_source_id: "ds1", access_mode: "read" }], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    const child2: FunctionalBlock = {
      id: "c2", name: "c2", purpose: "c2", parent_id: "parent",
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [
        { id: "c2i", block_id: "c2", name: "uncovered_in", direction: "in", contract: "", scope: "external" },
      ], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    createBlock(db, parent);
    createBlock(db, child1);
    createBlock(db, child2);
    // c1's out:out1 covered; parent's out:out1 covered (overreached flags none here); but parent exposed out:out1 matched.
    const res = compileBlockGraph(db);
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "IFACE_UNCOVERED")).toBe(true); // in:uncovered_in of c2
    // Also global-state: parent reads ds1, child1 reads ds1, child2 none → covered.
  });

  it("trigger trace + promote round-trip", () => {    createTrigger(db, { id: "t1", name: "create task", source: { kind: "ac", ac_id: "AC-001" } });
    const b: FunctionalBlock = {
      id: "b1", name: "create_task", purpose: "create", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "Task", description: "task" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: ["create"], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    createBlock(db, b);
    createTriggerTrace(db, { id: "tr1", trigger_id: "t1", target_block_id: "b1", effect: "creates task", data_source_effects: ["write tasks.db"], branch: "normal" });
    const nodes = (db.prepare(`SELECT COUNT(*) c FROM trigger_traces`).get() as any).c;
    expect(nodes).toBe(1);
    promoteBlock(db, "b1");
    expect(getBlock(db, "b1")?.status).toBe("accepted");
  });

  it("reset clears state (incl. FK-referencing tables, regression)", () => {
    createTrigger(db, { id: "t1", name: "x", source: { kind: "ac", ac_id: "AC-001" } });
    createDataSource(db, { id: "ds1", name: "d", category: "fs", access_mode: "read_write", entities: [], operations: [] });
    const b: FunctionalBlock = {
      id: "b1", name: "x", purpose: "x", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    createBlock(db, b);
    // trigger_traces references triggers + blocks — reset must clear FK-referencing rows first.
    createTriggerTrace(db, { id: "tr1", trigger_id: "t1", target_block_id: "b1", effect: "e", data_source_effects: [], branch: "normal" });
    expect(() => resetAll(db)).not.toThrow();
    for (const table of ["triggers", "blocks", "trigger_traces", "data_sources", "deps", "ports"]) {
      expect((db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c).toBe(0);
    }
  });

  it("createBlock tolerates undefined optional columns (regression: SQLite binding)", () => {
    // Regression for "Provided value cannot be bound to SQLite parameter 2" —
    // an agent may omit parent_id (and other optionals) → undefined must not reach SQL.
    const b = {
      id: "b1", name: "create_task",
      // parent_id / purpose intentionally undefined
    } as FunctionalBlock;
    expect(() => createBlock(db, b)).not.toThrow();
    const got = getBlock(db, "b1");
    expect(got?.parent_id).toBe(null);
    expect(got?.purpose).toBe("");
    expect(got?.status).toBe("draft");
  });

  it("requirements coverage reverse-lookups AC/FR → trigger → block", () => {
    // Two requirements reachable via trigger bindings:
    //   AC-001 → trigger t1 + trace to block b1 (fully covered).
    //   FR-002 → trigger t2 but NO trace to any block (bound but un-traced).
    //   FR-003 → no trigger at all → not present in the matrix (nothing references it).
    createTrigger(db, { id: "t1", name: "export", source: { kind: "ac", ac_id: "AC-001" } });
    createTrigger(db, { id: "t2", name: "import", source: { kind: "fr", fr_id: "FR-002" } });
    const b: FunctionalBlock = {
      id: "b1", name: "x", purpose: "x", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    createBlock(db, b);
    createTriggerTrace(db, { id: "tr1", trigger_id: "t1", target_block_id: "b1", effect: "e", data_source_effects: [], branch: "normal" });

    const cov = getRequirementsCoverage(db);
    expect(cov.total).toBe(2); // AC-001 + FR-002 (FR-003 has no trigger)
    const byRef = (k: string) => cov.requirements.find((r) => r.ref_id === k)!;
    expect(byRef("AC-001").coverage).toBe("covered");
    expect(byRef("AC-001").triggers[0].blocks).toContain("b1"); // trigger traces to a block
    expect(byRef("FR-002").coverage).toBe("covered"); // has a trigger → bound to PRD
    expect(byRef("FR-002").triggers[0].blocks).toHaveLength(0); // but no trace to a block
    expect(cov.covered).toBe(2);
    expect(cov.uncovered).toBe(0);
  });

  it("sourceRefToString tolerates a double-encoded source string (regression: NO_SOURCE)", () => {
    // A stored string of a SourceRef must be readable — previously returned "" → NO_SOURCE.
    expect(sourceRefToString({ kind: "ac", ac_id: "AC-001" })).toBe("ac:AC-001");
    expect(sourceRefToString(JSON.stringify({ kind: "ac", ac_id: "AC-001" }))).toBe("ac:AC-001");
    expect(sourceRefToString(JSON.stringify({ kind: "derived", from: [{ kind: "flow_node", node_id: "n1" }], reason: "agg" }))).toBe("derived(flow_node:n1)");
    expect(sourceRefToString("not-json")).toBe(""); // unparseable → untraceable, not a crash
  });

  it("resetDrafts clears only draft blocks, preserving accepted + triggers", () => {
    createTrigger(db, { id: "t1", name: "x", source: { kind: "ac", ac_id: "AC-001" } });
    const mk = (id: string, status: "draft" | "accepted"): FunctionalBlock => ({
      id, name: id, purpose: id, parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status,
    });
    createBlock(db, mk("b_draft", "draft"));
    createBlock(db, mk("b_keep", "accepted"));
    createTriggerTrace(db, { id: "tr1", trigger_id: "t1", target_block_id: "b_draft", effect: "e", data_source_effects: [], branch: "normal" });

    resetDrafts(db);
    expect(getBlock(db, "b_draft")).toBeNull();      // draft block gone
    expect(getBlock(db, "b_keep")?.status).toBe("accepted"); // accepted preserved
    expect((db.prepare(`SELECT COUNT(*) c FROM triggers`).get() as any).c).toBe(1); // trigger untouched
    expect((db.prepare(`SELECT COUNT(*) c FROM trigger_traces`).get() as any).c).toBe(0); // draft's trace cleaned
  });

  it("resetDrafts detaches accepted child from a draft parent (regression: blocks.parent_id FK)", () => {
    const mk = (id: string, parent_id: string | null, status: "draft" | "accepted"): FunctionalBlock => ({
      id, name: id, purpose: id, parent_id,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status,
    });
    createBlock(db, mk("parent_draft", null, "draft"));
    createBlock(db, mk("accepted_child", "parent_draft", "accepted")); // accepted child of a draft parent
    createBlock(db, mk("draft_child", "parent_draft", "draft"));       // draft child of a draft parent

    expect(() => resetDrafts(db)).not.toThrow(); // must not hit blocks.parent_id FK violation
    expect(getBlock(db, "parent_draft")).toBeNull();
    expect(getBlock(db, "draft_child")).toBeNull();
    expect(getBlock(db, "accepted_child")?.status).toBe("accepted"); // accepted survives
    expect(getBlock(db, "accepted_child")?.parent_id).toBeNull();    // detached to root
  });

  it("begin_initialization respects repo_path (regression: snake_case arg vs camelCase read)", () => {
    const initDir = path.join(os.tmpdir(), "acc-init-" + Date.now());
    const ctx = newContext();
    const res = handleBeginInitialization({ repo_path: initDir }, ctx);
    expect(res.ok).toBe(true);
    expect(res.data?.repo_path).toBe(initDir);
    expect(ctx.repoPath).toBe(initDir);
    if (ctx.db) closeStore(ctx.db);
    expect(fs.existsSync(path.join(initDir, ".acceptance", "acceptance.db"))).toBe(true);
    deleteStore(initDir);
  });

  it("global-state conservation is access-mode-lattice aware (parent read_write authorizes a child read as long as write is realized elsewhere, regression)", () => {
    createDataSource(db, { id: "ds1", name: "d", category: "db", access_mode: "read_write", entities: [], operations: [] });
    const mkB = (id: string, parent_id: string | null, ops: { data_source_id: string; access_mode: "read" | "write" | "read_write" }[]): FunctionalBlock => ({
      id, name: id, purpose: id, parent_id,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: ops, source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    });
    createBlock(db, mkB("parent", null, [{ data_source_id: "ds1", access_mode: "read_write" }]));
    createBlock(db, mkB("writer", "parent", [{ data_source_id: "ds1", access_mode: "read_write" }]));
    createBlock(db, mkB("reader", "parent", [{ data_source_id: "ds1", access_mode: "read" }]));
    const res = compileBlockGraph(db);
    // no false positive: parent read_write authorizes reader's read; write realized by writer
    expect(res.errors?.some((e) => e.code === "GS_OP_UNCOVERED" || e.code === "GS_OP_OVERREACHED")).toBe(false);
  });

  it("global-state conservation still flags a parent op unrealized by any child (write not covered)", () => {
    createDataSource(db, { id: "ds1", name: "d", category: "db", access_mode: "read_write", entities: [], operations: [] });
    const mkB = (id: string, parent_id: string | null, ops: { data_source_id: string; access_mode: "read" | "write" | "read_write" }[]): FunctionalBlock => ({
      id, name: id, purpose: id, parent_id,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: ops, source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    });
    createBlock(db, mkB("parent", null, [{ data_source_id: "ds1", access_mode: "read_write" }]));
    createBlock(db, mkB("reader", "parent", [{ data_source_id: "ds1", access_mode: "read" }]));
    const res = compileBlockGraph(db);
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "GS_OP_OVERREACHED")).toBe(true);
  });

  it("createBlock is atomic: a malformed dep rolls back the block and ports (no partial write)", () => {
    const mkPorts = (): Port[] => [{ id: "b_in", block_id: "b", name: "in", direction: "in", contract: "", scope: "external" }];
    const block: FunctionalBlock = {
      id: "b", name: "b", purpose: "b", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: mkPorts(), deps: ["blk_ghost" as any], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    };
    expect(() => createBlock(db, block)).toThrow();
    expect(getBlock(db, "b")).toBeNull();
    expect((db.prepare(`SELECT COUNT(*) c FROM ports`).get() as any).c).toBe(0);
  });

  it("handleProposeBlock rejects a bare-string deps list with an instructive error (no write)", () => {
    createDataSource(db, { id: "ds1", name: "d", category: "db", access_mode: "read_write", entities: [], operations: [] });
    const ctx = newContext(); ctx.db = db; ctx.repoPath = dir;
    const res = handleProposeBlock({
      id: "b", name: "b", purpose: "", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: ["blk_app"], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    } as any, ctx);
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "INVALID_DEP")).toBe(true);
    expect(getBlock(db, "b")).toBeNull(); // no partial write either
  });

  it("handleProposeBlock rejects an already-existing block id (BLOCK_EXISTS)", () => {
    const ctx = newContext(); ctx.db = db; ctx.repoPath = dir;
    createBlock(db, {
      id: "b", name: "b", purpose: "b", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    });
    const res = handleProposeBlock({
      id: "b", name: "b2", purpose: "", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    } as any, ctx);
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.code === "BLOCK_EXISTS")).toBe(true);
  });

  it("updateBlock edits in place, resets to draft, and leaves unprovided fields intact", () => {
    createBlock(db, {
      id: "b", name: "old", purpose: "p", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "accepted",
    });
    const ok = updateBlock(db, "b", { name: "new" });
    expect(ok).toBe(true);
    const b = getBlock(db, "b")!;
    expect(b.name).toBe("new");
    expect(b.purpose).toBe("p");          // unprovided field intact (regression: no undefined-clobber)
    expect(b.parent_id).toBeNull();
    expect(b.status).toBe("draft");       // edit un-freezes to draft
  });

  it("updateBlock replaces ports when provided (id preserved)", () => {
    createBlock(db, {
      id: "b", name: "b", purpose: "p", parent_id: null,
      function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
      boundary: { in_scope: [], out_of_scope: [] }, ports: [{ id: "b_in", block_id: "b", name: "in", direction: "in", contract: "", scope: "external" }], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    });
    updateBlock(db, "b", { ports: [{ id: "b_out", name: "out", direction: "out", contract: "", scope: "external" }] } as any);
    const b = getBlock(db, "b")!;
    expect(b.ports.map((p) => p.id)).toEqual(["b_out"]); // old port replaced
  });

  it("updateBlock/updateTrigger/updateDataSource return false when the entity is missing", () => {
    expect(updateBlock(db, "nope", { name: "x" })).toBe(false);
    expect(updateTrigger(db, "nope", { name: "x" })).toBe(false);
    expect(updateDataSource(db, "nope", { name: "x" })).toBe(false);
  });

  it("updateTrigger and updateDataSource edit in place", () => {
    createTrigger(db, { id: "t1", name: "old", source: { kind: "ac", ac_id: "AC-001" } });
    createDataSource(db, { id: "ds1", name: "store", category: "db", access_mode: "read_write", entities: [], operations: [] });
    expect(updateTrigger(db, "t1", { name: "new" })).toBe(true);
    expect(updateDataSource(db, "ds1", { access_mode: "read" })).toBe(true);
    expect(db.prepare(`SELECT name FROM triggers WHERE id = 't1'`).get() as any).toMatchObject({ name: "new" });
    expect(db.prepare(`SELECT access_mode FROM data_sources WHERE id = 'ds1'`).get() as any).toMatchObject({ access_mode: "read" });
  });

  // ── V2.1: graph change log + monotonic version ──────────────────────────────
  const mk = (id: string, opts?: Partial<FunctionalBlock>): FunctionalBlock => ({
    id, name: id, purpose: id, parent_id: null,
    function_spec: { inputs: [], outputs: { type: "x", description: "" }, preconditions: [], postconditions: [], invariants: [], error_handling: {} },
    boundary: { in_scope: [], out_of_scope: [] }, ports: [], deps: [], data_operations: [], source: { kind: "ac", ac_id: "AC-001" }, status: "draft",
    ...opts,
  });

  it("change log records create/update with before/after + reason, and version bumps only on promote", () => {
    createBlock(db, mk("b1", { purpose: "old" }), { actor: "structure_agent", reason: "init" });
    expect(getGraphVersion(db)).toBe(0); // draft edit does NOT bump version
    updateBlock(db, "b1", { purpose: "new" }, { actor: "steward", reason: "request:cr-42" });
    expect(getGraphVersion(db)).toBe(0); // still at 0 (not accepted yet)

    const log = listChangeLog(db, { target_id: "b1" });
    expect(log.length).toBe(2); // create_block + update_block
    expect(log[0].kind).toBe("create_block");
    expect(log[0].reason).toBe("init");
    expect(log[1].kind).toBe("update_block");
    expect(log[1].actor).toBe("steward");
    expect(log[1].reason).toBe("request:cr-42");
    expect((log[1].before as any).purpose).toBe("old");
    expect((log[1].after as any).purpose).toBe("new");

    promoteBlock(db, "b1");
    expect(getGraphVersion(db)).toBe(1); // promote bumps version
    const afterPromote = listChangeLog(db, { kind: "promote_block" });
    expect(afterPromote).toHaveLength(1);
    expect(afterPromote[0].graph_version).toBe(1);
  });

  it("revert_change restores the `before` of an update (rollback a bad edit)", () => {
    createBlock(db, mk("b1", { purpose: "old" }));
    updateBlock(db, "b1", { purpose: "bad" });
    expect(getBlock(db, "b1")?.purpose).toBe("bad");
    const upd = listChangeLog(db, { kind: "update_block" })[0];
    expect(revertChange(db, upd.id)).toBe(true);
    expect(getBlock(db, "b1")?.purpose).toBe("old");
  });

  it("revert_change on an added port removes the port (fine-grained delete)", () => {
    createBlock(db, mk("b1"));
    addPort(db, { id: "p_in", block_id: "b1", name: "in", direction: "in", contract: "", scope: "external" });
    expect((getBlock(db, "b1")?.ports ?? []).length).toBe(1);
    const add = listChangeLog(db, { kind: "add_port" })[0];
    expect(revertChange(db, add.id)).toBe(true);
    expect((getBlock(db, "b1")?.ports ?? []).length).toBe(0);
  });

  it("add_dependency is logged and an added dep is revertible", () => {
    createBlock(db, mk("src"));
    createBlock(db, mk("dst"));
    addDependency(db, { id: "d1", source_block_id: "src", target_block_id: "dst", via_port: "out", protocol: "data", source: { kind: "ac", ac_id: "AC-001" } });
    const log = listChangeLog(db, { kind: "add_dep" });
    expect(log).toHaveLength(1);
    expect(revertChange(db, log[0].id)).toBe(true);
    expect((db.prepare(`SELECT COUNT(*) c FROM deps`).get() as any).c).toBe(0);
  });
});
