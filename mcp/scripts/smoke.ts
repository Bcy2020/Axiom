/**
 * Acceptance-Driven MCP — smoke self-check (V2).
 * Uses deterministic data (a create_task example derived from a PRD-like acceptance
 * criterion) to run the full tool chain: begin → record trigger → record flow tree →
 * record data source → propose block → record trigger trace → compile → query →
 * promote. No LLM needed.
 */
import os from "node:os";
import path from "node:path";
import {
  newContext, handleBeginInitialization, handleRecordTrigger, handleRecordFlowTree,
  handleProposeBlock, handleCompileBlockGraph, handleQueryBlock, handleQueryFlowTree,
  handleListBlocks, handleRecordDataSource, handleListDataSources, handleRecordTriggerTrace,
  handleQueryTriggerTrace, handlePromoteBlock,
} from "../src/mcp/tools.js";
import type { Trigger, TriggerFeedbackTree, FeedbackNode, FunctionalBlock, DataSource } from "../src/graph/schema.js";

const ctx = newContext();
const repoPath = path.join(os.tmpdir(), "acceptance-smoke-" + Date.now());
console.log("▲ repo:", repoPath);

console.log("▸ begin_initialization", handleBeginInitialization({ repoPath }, ctx));

// ── trigger (from AC-001: user creates a task and sees it in the list) ────────
const trigger: Trigger = {
  id: "trigger.create_task", name: "create task", command: "add",
  precondition: "authenticated and task fields provided",
  source: { kind: "ac", ac_id: "AC-001" },
};
console.log("▸ record_trigger", handleRecordTrigger(trigger, ctx));

// ── global state source (V2) ──────────────────────────────────────────────────
const ds: DataSource = {
  id: "ds.tasks", name: "tasks store", category: "db", access_mode: "read_write",
  entities: ["Task"], operations: ["create", "list"],
};
console.log("▸ record_data_source", handleRecordDataSource(ds, ctx));
console.log("▸ list_data_sources", handleListDataSources({}, ctx));

// ── trigger→feedback tree (branching: success + business_fail) ───────────────
const root: FeedbackNode = {
  id: "ct.root", type: "decision_point", guard_condition: "task fields valid",
  source: { kind: "ac", ac_id: "AC-001" },
  branches: [
    {
      id: "ct.valid", type: "feedback_leaf", feedback_type: "success",
      message: "task created and shown in list", source: { kind: "flow_node", node_id: "ct.valid" },
      branches: [
        { id: "ct.write", type: "action", action: "persist task to store", source: { kind: "flow_node", node_id: "ct.write" } },
      ],
    },
    {
      id: "ct.invalid", type: "feedback_leaf", feedback_type: "business_fail",
      message: "validation error returned", source: { kind: "flow_node", node_id: "ct.invalid" },
    },
  ],
};
const tree: TriggerFeedbackTree = { id: "tree.create_task", trigger_id: "trigger.create_task", root, source: { kind: "ac", ac_id: "AC-001" } };
console.log("▸ record_flow_tree", handleRecordFlowTree(tree, ctx));

// ── propose block (aggregate: covers success leaf + persist action) ───────────
const block: FunctionalBlock = {
  id: "block.create_task", name: "create_task", purpose: "Create a task with all fields and persist it",
  parent_id: null,
  function_spec: {
    inputs: [{ name: "fields", type: "dict", description: "task fields" }],
    outputs: { type: "Task", description: "created task" },
    preconditions: ["task fields valid"], postconditions: ["task persisted"], invariants: [],
    error_handling: { business_fail: "validation error returned" },
  },
  boundary: { in_scope: ["create task"], out_of_scope: ["list tasks", "update task"] },
  ports: [
    { id: "p1", block_id: "block.create_task", name: "store", direction: "out", contract: "persist Task" },
    { id: "p2", block_id: "block.create_task", name: "inputs", direction: "in", contract: "task fields" },
  ],
  deps: [],
  data_operations: [{ data_source_id: "ds.tasks", access_mode: "read_write" }],
  source: { kind: "derived", from: [{ kind: "flow_node", node_id: "ct.valid" }, { kind: "flow_node", node_id: "ct.write" }], reason: "aggregates create-task success paths" },
  status: "draft",
};
console.log("▸ propose_block", handleProposeBlock(block, ctx));

// ── trigger trace (V2): trigger → block edge ──────────────────────────────────
console.log("▸ record_trigger_trace", handleRecordTriggerTrace({
  id: "trace.create_task", trigger_id: "trigger.create_task", target_block_id: "block.create_task",
  effect: "creates a task", data_source_effects: ["write ds.tasks"], branch: "normal",
}, ctx));
console.log("▸ query_trigger_trace", handleQueryTriggerTrace({ trigger_id: "trigger.create_task" }, ctx));

console.log("▸ compile_block_graph (local)", handleCompileBlockGraph({ block_id: "block.create_task" }, ctx));
console.log("▸ compile_block_graph (global)", handleCompileBlockGraph({}, ctx));
console.log("▸ promote_block", handlePromoteBlock({ block_id: "block.create_task" }, ctx));
console.log("▸ list_blocks", handleListBlocks({}, ctx));
console.log("▸ query_block", handleQueryBlock({ block_id: "block.create_task" }, ctx));
console.log("▸ query_flow_tree", handleQueryFlowTree({ tree_id: "tree.create_task" }, ctx));

console.log("◼ smoke complete");
