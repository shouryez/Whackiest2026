import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runTool } from "../control/tiers";
import { getRepo } from "../repo";
import { FAMILY_TOOLS } from "../packs/kaiseho/tools/familyTools";

/**
 * /mcp/family — the child's door (Claude or any MCP client). Same server, same control
 * layer as the voice agent: "one brain, two doors". Tools are scoped to the token's family.
 */
export interface FamilyPrincipal { familyId: string; memberId: string; name: string }

function buildFamilyServer(who: FamilyPrincipal): McpServer {
  const server = new McpServer(
    { name: "kaiseho-family", version: "0.1.0" },
    {
      instructions:
        "KaiseHo family tools: check on an elderly parent who gets a short daily AI check-in call. " +
        "Use get_weekly_summary for 'how was she', get_conversation_starters for 'what should I talk about', " +
        "leave_message_for_elder to pass on a message, add_medication when a doctor adds a medicine. " +
        "The parent controls what is shared; private items are never returned.",
    },
  );
  for (const tool of Object.values(FAMILY_TOOLS)) {
    server.registerTool(
      tool.spec.name,
      { description: tool.description, inputSchema: tool.shape },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const elderId = args.elder_id ?? (await getRepo().listEldersByFamily(who.familyId))[0]?.elderId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return runTool(tool.spec as any, { ...args, elder_id: elderId }, { actor: `family:${who.memberId}`, familyId: who.familyId });
      },
    );
  }
  return server;
}

export async function handleFamilyMcp(req: Request, who: FamilyPrincipal): Promise<Response> {
  const server = buildFamilyServer(who);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}
