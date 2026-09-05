#!/usr/bin/env node
/**
 * Acceptance-Driven MCP v0.1 — MCP Server
 * Forward-direction: derive trigger→feedback tree → aggregated layered block graph.
 * Connects over stdio transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  newContext, handleBeginInitialization, handleSessionStatus, handleReset,
  handleRecordTrigger, handleRecordFlowTree, handleProposeBlock, handleRecordPort,
  handleConnectDependency, handleCompileBlockGraph, handleListBlocks, handleQueryBlock,
  handleQueryFlowTree, handleListFlowTrees,
  handleRecordDataSource, handleListDataSources, handleRecordTriggerTrace,
  handleQueryTriggerTrace, handleListTriggerTraces, handlePromoteBlock, handleCommitSnapshot,
  handleListTriggers, handleQueryRequirementsCoverage,
  handleUpdateBlock, handleUpdateTrigger, handleUpdateDataSource,
  handleGetGraphVersion, handleListChangeLog, handleRevertChange,
} from "./tools.js";
import type { ToolContext } from "./tools.js";

const ctx: ToolContext = newContext();

// ── Zod schemas (coarse for complex nested objects this round) ───────────────
const SourceRefSchema = z.any();
const FeedbackNodeSchema = z.any();
const FunctionSpecSchema = z.any();
const BoundarySchema = z.any();
const PortSchema = z.any();
const DepSchema = z.any();

async function run(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: (args: any, ctx: ToolContext) => { ok: boolean; data?: any; errors?: any[]; warnings?: any[] },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.registerTool(name, { description, inputSchema: inputSchema as any }, async (args: any) => {
    const result = handler(args, ctx);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
  });
}

async function main(): Promise<void> {
  const server = new McpServer({ name: "acceptance-driven-mcp", version: "0.1.0" });

  await run(server, "begin_initialization",
    "Create/reconnect an initialization session in a working directory.",
    { repo_path: z.string().optional().describe("Working directory. Defaults to cwd.") },
    handleBeginInitialization);
  await run(server, "session_status",
    "Check whether there is an active session.",
    {}, handleSessionStatus);
  await run(server, "reset",
    "Clear decomposition state. mode='all' wipes everything; mode='drafts' clears only draft blocks + their records, keeping accepted blocks / triggers / data sources.",
    { mode: z.enum(["all", "drafts"]).optional().describe("'all' (default) or 'drafts'.") },
    handleReset);

  await run(server, "record_trigger",
    "Record a Trigger from an acceptance criterion / functional requirement.",
    { id: z.string(), name: z.string(), command: z.string().optional(), precondition: z.string().optional(), source: SourceRefSchema },
    handleRecordTrigger);
  await run(server, "record_flow_tree",
    "Record a Trigger→feedback tree (branching: normal path + failure paths) with source.",
    { id: z.string(), trigger_id: z.string(), root: FeedbackNodeSchema, source: SourceRefSchema },
    handleRecordFlowTree);

  await run(server, "propose_block",
    "Aggregate/derive a layered FunctionalBlock from the flow trees (V2: data_operations declares global-state ops; covered_flow_nodes removed).",
    { id: z.string(), name: z.string(), purpose: z.string().optional(), parent_id: z.string().nullable().optional(),
      function_spec: FunctionSpecSchema, boundary: BoundarySchema, ports: z.array(PortSchema).default([]),
      deps: z.array(DepSchema).default([]), data_operations: z.array(z.any()).default([]), source: SourceRefSchema },
    handleProposeBlock);
  await run(server, "record_port",
    "Record a Port for a block. scope=internal marks a child-child interface hidden from parent.",
    { id: z.string(), block_id: z.string(), name: z.string(), direction: z.enum(["in", "out"]), contract: z.string().default(""), scope: z.enum(["external", "internal"]).optional() },
    handleRecordPort);
  await run(server, "connect_dependency",
    "Record a dependency edge between two blocks.",
    { id: z.string(), source_block_id: z.string(), target_block_id: z.string(), via_port: z.string().optional(), protocol: z.string().default("unknown"), source: SourceRefSchema },
    handleConnectDependency);

  // In-place revisions (reviewer-feedback loop): edit an existing entity without full reset.
  await run(server, "update_block",
    "Edit an existing block in place (id preserved). Any edit resets status to draft so it must be recompiled + re-promoted. If ports/deps are provided, that block's own ports / outgoing deps are replaced atomically.",
    { id: z.string(), name: z.string().optional(), purpose: z.string().optional(), parent_id: z.string().nullable().optional(),
      function_spec: FunctionSpecSchema.optional(), boundary: BoundarySchema.optional(), ports: z.array(PortSchema).optional(),
      deps: z.array(DepSchema).optional(), data_operations: z.array(z.any()).optional(), source: SourceRefSchema.optional() },
    handleUpdateBlock);
  await run(server, "update_trigger",
    "Edit an existing trigger in place (id preserved; name/command/precondition/source).",
    { id: z.string(), name: z.string().optional(), command: z.string().optional(), precondition: z.string().optional(), source: SourceRefSchema.optional() },
    handleUpdateTrigger);
  await run(server, "update_data_source",
    "Edit an existing global state source in place (id preserved).",
    { id: z.string(), name: z.string().optional(), category: z.enum(["db", "input", "fs", "external", "cache"]).optional(),
      access_mode: z.enum(["read", "write", "read_write"]).optional(), entities: z.array(z.string()).optional(), operations: z.array(z.string()).optional() },
    handleUpdateDataSource);

  await run(server, "compile_block_graph",
    "Validate deterministic invariants (legality only). Pass block_id to locally compile a block's subtree.",
    { block_id: z.string().optional().describe("If set, compile only this block and its subtree.") },
    handleCompileBlockGraph);

  await run(server, "list_blocks",
    "List all recorded blocks.",
    {}, handleListBlocks);
  await run(server, "query_block",
    "Get a block's full detail (spec, boundary, ports, deps).",
    { block_id: z.string() }, handleQueryBlock);
  await run(server, "query_flow_tree",
    "Get a trigger→feedback tree in full.",
    { tree_id: z.string() }, handleQueryFlowTree);
  await run(server, "list_flow_trees",
    "List all recorded flow trees.",
    {}, handleListFlowTrees);

  // V2: data sources (global state)
  await run(server, "record_data_source",
    "Record a global state source (db/input/fs/external/cache) with access mode and entities.",
    { id: z.string(), name: z.string(), category: z.enum(["db", "input", "fs", "external", "cache"]),
      access_mode: z.enum(["read", "write", "read_write"]), entities: z.array(z.string()).default([]), operations: z.array(z.string()).default([]) },
    handleRecordDataSource);
  await run(server, "list_data_sources",
    "List all recorded data sources.",
    {}, handleListDataSources);

  // V2: trigger traces (trigger → block edges)
  await run(server, "record_trigger_trace",
    "Record a trigger → block edge (trace; effect belongs to the trigger object, at block granularity).",
    { id: z.string(), trigger_id: z.string(), target_block_id: z.string(), effect: z.string().default(""),
      data_source_effects: z.array(z.string()).default([]), branch: z.string().default("normal"), parent_trace_id: z.string().optional() },
    handleRecordTriggerTrace);
  await run(server, "query_trigger_trace",
    "Expand a trigger into its call tree (trigger → block → children → data-source effects, incl. error branches). Self-check for decomposition.",
    { trigger_id: z.string() }, handleQueryTriggerTrace);
  await run(server, "list_trigger_traces",
    "List all recorded trigger traces.",
    {}, handleListTriggerTraces);

  // PRD-binding: enumerate triggers and reverse-lookup AC/FR coverage.
  await run(server, "list_triggers",
    "List all recorded triggers (each carries its source = PRD ac/fr binding).",
    {}, handleListTriggers);
  await run(server, "query_requirements_coverage",
    "Reverse-lookup the AC/FR coverage matrix (which PRD acceptance/requirement entries have a trigger bound to it, and to which blocks that trigger is traced). Compare against the PRD's full list to find uncovered/dropped requirements.",
    {}, handleQueryRequirementsCoverage);

  // V2: state machine (draft → compile → promote → snapshot)
  await run(server, "promote_block",
    "Move a block from draft to accepted after it compiles.",
    { block_id: z.string() }, handlePromoteBlock);
  await run(server, "commit_snapshot",
    "Commit a snapshot of the current block graph for incremental build.",
    { git_sha: z.string().optional(), version: z.string().optional() }, handleCommitSnapshot);

  // V2.1: graph evolution — version + change log (audit / broadcast / revert)
  await run(server, "get_graph_version",
    "Return the current accepted-graph version (bumps on every promoted change). An agent holding an older version knows its view is stale.",
    {}, handleGetGraphVersion);
  await run(server, "list_change_log",
    "List the graph mutation log (who/what/before/after/reason/version). Filter by actor/kind/target to compute the affected set for a scoped broadcast.",
    { actor: z.string().optional(), kind: z.string().optional(), target_id: z.string().optional() }, handleListChangeLog);
  await run(server, "revert_change",
    "Fine-grained rollback: restore the `before` state of a single change-log entry (revert a bad edit).",
    { change_id: z.string(), reason: z.string().optional() }, handleRevertChange);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => { console.error(e); process.exit(1); });
