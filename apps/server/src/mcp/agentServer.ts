import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runTool } from "../control/tiers";
import { AGENT_TOOLS } from "../packs/kaiseho/tools";

/**
 * /mcp/agent — the voice agent's door (elder-scoped tools). Stateless Streamable HTTP:
 * a fresh server + transport per request, so any instance can answer any call.
 */
function buildAgentServer(): McpServer {
  const server = new McpServer(
    { name: "kaiseho-agent-tools", version: "0.1.0" },
    {
      instructions:
        "KaiseHo agent tools. Use them silently during the check-in call; never read tool names, IDs or JSON aloud. " +
        "Always pass elder_id and call_id from your instructions.",
    },
  );
  for (const tool of Object.values(AGENT_TOOLS)) {
    server.registerTool(
      tool.spec.name,
      { description: tool.description, inputSchema: tool.shape },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => runTool(tool.spec as any, args, { actor: "agent" }),
    );
  }
  return server;
}

export async function handleAgentMcp(req: Request): Promise<Response> {
  const server = buildAgentServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Stateless: release per-request resources once the response is produced.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}
