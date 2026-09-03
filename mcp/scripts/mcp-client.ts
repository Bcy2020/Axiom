/**
 * Verify the MCP server actually speaks MCP over stdio — connect a real SDK Client,
 * list tools, and call a tool. This is the path a mounted agent conversation uses.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["--import", "tsx", "src/mcp/server.ts"],
  cwd: process.cwd(),
});
const client = new Client({ name: "acceptance-driven-test", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("▲ tools:", tools.tools.map((t) => t.name));

const res = await client.callTool({ name: "session_status", arguments: {} });
console.log("▲ session_status:", (res as any).content?.[0]?.text ?? res);

await client.close();
console.log("◼ mcp client round-trip OK");
