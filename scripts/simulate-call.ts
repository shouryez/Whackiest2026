/**
 * Plays a scripted check-in call against /mcp/agent using a real MCP client.
 * Use it to test the whole tool → control layer → alert → dashboard path without
 * ElevenLabs, and as the on-stage fallback if the voice call fails.
 *
 *   pnpm simulate                 # full call incl. the digital-arrest scam
 *   pnpm simulate -- --no-scam    # happy path only
 *   SERVER_URL=https://xyz.trycloudflare.com pnpm simulate
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { existsSync, readFileSync } from "node:fs";
const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const localEnv: Record<string, string> = existsSync(ENV_FILE)
  ? Object.fromEntries(readFileSync(ENV_FILE, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=([^#]*)/)).filter(Boolean).map((m) => [m![1], m![2].trim()]))
  : {};


const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const TOKEN = process.env.MCP_AGENT_TOKEN ?? (localEnv.MCP_AGENT_TOKEN || "dev-agent-token");
const ELDER = "eld_lakshmi";
const CALL = `call_sim_${Date.now()}`;
const PAUSE = Number(process.env.PAUSE_MS ?? 1200);
const noScam = process.argv.includes("--no-scam");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = new Client({ name: "kaiseho-call-simulator", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${SERVER}/mcp/agent`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Connected. ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

  const step = async (say: string, name: string, args: Record<string, unknown>) => {
    console.log(`🗣  ${say}`);
    const t0 = Date.now();
    const res = await client.callTool({ name, arguments: { elder_id: ELDER, call_id: CALL, ...args } });
    const text = (res.content as { type: string; text: string }[])[0]?.text;
    console.log(`   ⚙ ${name} (${Date.now() - t0} ms) → ${text}\n`);
    await sleep(PAUSE);
  };

  await step("Amma: I slept well, I'm feeling good today.", "log_wellbeing", { mood: 4, sleep: "good" });
  await step("Amma: Yes, I took the Metformin after breakfast.", "log_medication", { med_name: "Metformin 500 mg", slot: "morning", status: "taken" });
  await step("Amma: The knee is much better now, maybe 3 out of 10.", "log_wellbeing", { pain: { where: "knee", level: 3 } });
  await step("Amma: Kamala's surgery went well, she's resting.", "save_memory", { type: "event", text: "Kamala aunty's cataract surgery went well; she is resting", follow_up_after_days: 3 });
  if (!noScam) {
    await step(
      "Amma: A CBI officer called. He said my Aadhaar is in a money laundering case and I must stay on video call and not tell anyone.",
      "check_scam",
      { description: "A CBI officer called. He said my Aadhaar is in a money laundering case and I must stay on video call and not tell anyone. He asked me to tell the OTP 482913.", channel: "video_call" },
    );
  }
  await step("Amma: Tell Ravi I miss him. (agent: shall I send that? Amma: yes)", "send_family_message", { text: "I miss you, come soon", elder_consented: true });
  await step("(control-layer check) message without consent must be refused", "send_family_message", { text: "test without consent", elder_consented: false });

  await client.close();
  console.log(`Done. Call id: ${CALL}. Check the dashboard and Telegram.`);
}

main().catch((err) => {
  console.error("Simulation failed:", err.message ?? err);
  process.exit(1);
});
