/**
 * Exercises the family door (/mcp/family) the way Claude would, over a real MCP client.
 *   pnpm ask-family
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const TOKEN = process.env.FAMILY_TOKEN ?? "dev-family-token";

const client = new Client({ name: "kaiseho-family-check", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${SERVER}/mcp/family`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
const { tools } = await client.listTools();
console.log(`Family door: ${tools.length} tools → ${tools.map((t) => t.name).join(", ")}\n`);

const ask = async (q: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`🧑 "${q}"\n   ⚙ ${name} → ${(r.content as { text: string }[])[0].text.slice(0, 600)}\n`);
};
await ask("How was Amma this week?", "get_weekly_summary");
await ask("What should I talk to her about tonight?", "get_conversation_starters");
await ask("Her doctor added Telmisartan 40 mg at 9 PM.", "add_medication", { name: "Telmisartan", dose: "40 mg", slots: ["night"] });
await ask("Tell her I'll visit Sunday.", "leave_message_for_elder", { text: "I'll visit on Sunday with the kids", from_name: "Ravi" });
await client.close();
