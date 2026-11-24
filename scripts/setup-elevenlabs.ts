/**
 * One-command ElevenLabs setup for KaiseHo.
 *
 *   1. Put ELEVENLABS_API_KEY in apps/server/.env
 *   2. Start the app (pnpm dev) and a tunnel (pnpm tunnel); put the https tunnel URL in PUBLIC_BASE_URL
 *   3. pnpm setup:elevenlabs
 *
 * It creates (or updates, if the IDs are already in .env):
 *   - 2 MCP servers: /mcp/agent (voice agent door) and /mcp/family (briefing agent), auto-approve, bearer tokens
 *   - agent "kaiseho-caller" (prompt, first message, voice, dynamic-variable defaults, data collection, eval criteria)
 *   - agent "kaiseho-briefing" (calls the son / neighbour in emergencies)
 *   - picks a voice if ELEVENLABS_DIGEST_VOICE_ID is empty
 *   - assigns the caller agent to your imported Twilio number and saves ELEVENLABS_PHONE_NUMBER_ID
 * and writes every ID back into apps/server/.env. The API key is never printed.
 *
 * Manual step left (dashboard-only): post-call webhook URL + HMAC secret (printed at the end).
 * Request shapes follow the ElevenLabs API reference (agents/create, mcp/create, phone-numbers).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dirname, "../apps/server/.env");
const envText = readFileSync(ENV_PATH, "utf8");
const env: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=([^#]*)/);
  if (m) env[m[1]] = m[2].trim();
}
function saveEnv(key: string, value: string) {
  let text = readFileSync(ENV_PATH, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(ENV_PATH, text);
  env[key] = value;
}

const KEY = env.ELEVENLABS_API_KEY;
const BASE = env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";
const PUBLIC = (env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const LLM = process.env.ELEVENLABS_LLM || "gemini-2.5-flash";
const LANGUAGE = process.env.ELEVENLABS_AGENT_LANGUAGE || "hi"; // "kn" once Kannada is tested on day one
const TTS_MODEL = process.env.ELEVENLABS_AGENT_TTS || "eleven_flash_v2_5";

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
if (!KEY) die("ELEVENLABS_API_KEY is empty in apps/server/.env. Paste your key there first.");
if (!PUBLIC.startsWith("https://")) die(`PUBLIC_BASE_URL must be your https tunnel URL (run "pnpm tunnel"). Now: "${PUBLIC || "(empty)"}"`);
if (!env.MCP_AGENT_TOKEN || !env.FAMILY_TOKEN_DEMO) die("MCP_AGENT_TOKEN / FAMILY_TOKEN_DEMO missing in .env.");

async function el<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`), { status: res.status });
  return (text ? JSON.parse(text) : {}) as T;
}

const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8");
function extractFenced(md: string): string {
  const m = md.match(/```text\n([\s\S]*?)```/);
  return (m ? m[1] : md).trim();
}

// ---------- 0. sanity: is our server reachable through the tunnel? ----------
async function checkTunnel() {
  try {
    const r = await fetch(`${PUBLIC}/health`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { ok?: boolean };
    if (!j.ok) throw new Error("bad health");
    console.log(`✓ Server reachable at ${PUBLIC}`);
  } catch {
    die(`Can't reach ${PUBLIC}/health. Is "pnpm dev" running and is the tunnel URL current?`);
  }
}

// ---------- 1. voice ----------
async function ensureVoice(): Promise<string> {
  if (env.ELEVENLABS_DIGEST_VOICE_ID) {
    console.log(`✓ Voice: using ELEVENLABS_DIGEST_VOICE_ID from .env`);
    return env.ELEVENLABS_DIGEST_VOICE_ID;
  }
  type V = { voice_id: string; name: string; labels?: Record<string, string>; verified_languages?: { language: string }[] };
  const pick = async (q: string) => (await el<{ voices: V[] }>("GET", `/v2/voices?${q}&page_size=50`)).voices;
  let voices = await pick("search=indian");
  if (!voices.length) voices = await pick("category=premade");
  const score = (v: V) =>
    (v.verified_languages?.some((l) => l.language === "hi") ? 4 : 0) +
    (/female|woman/i.test(JSON.stringify(v.labels ?? {})) ? 2 : 0) +
    (/calm|warm|soft|friendly/i.test(JSON.stringify(v.labels ?? {}) + v.name) ? 1 : 0);
  const best = voices.sort((a, b) => score(b) - score(a))[0];
  if (!best) die("No voices found on this account.");
  saveEnv("ELEVENLABS_DIGEST_VOICE_ID", best.voice_id);
  console.log(`✓ Voice: picked "${best.name}" (change it any time in .env, then re-run)`);
  return best.voice_id;
}

// ---------- 2. MCP servers ----------
async function ensureMcp(envKey: string, name: string, path: string, token: string): Promise<string> {
  await el("PATCH", "/v1/convai/settings", { can_use_mcp_servers: true }).catch(() => {});
  const config = {
    url: `${PUBLIC}${path}`,
    name,
    description: name.includes("Family") ? "KaiseHo family door (briefing agent)" : "KaiseHo elder-scoped tools for the daily check-in call",
    transport: "STREAMABLE_HTTP",
    approval_policy: "auto_approve_all",
    request_headers: { Authorization: `Bearer ${token}` },
  };
  if (env[envKey]) {
    try {
      await el("PATCH", `/v1/convai/mcp-servers/${env[envKey]}`, { config });
      console.log(`✓ MCP server "${name}" updated → ${config.url}`);
      return env[envKey];
    } catch {
      console.log(`  (couldn't update MCP server ${env[envKey]}; creating a new one)`);
    }
  }
  try {
    const r = await el<{ id: string }>("POST", "/v1/convai/mcp-servers", { config });
    saveEnv(envKey, r.id);
    console.log(`✓ MCP server "${name}" created → ${config.url}`);
    return r.id;
  } catch (err) {
    if (String((err as Error).message).match(/terms|consent|not allowed|forbidden|403/i)) {
      die(`ElevenLabs needs you to enable MCP once in the dashboard: Agents → any agent → Tools → MCP → accept the terms. Then re-run.\n  ${(err as Error).message}`);
    }
    throw err;
  }
}

// ---------- 3. agents ----------
const CALLER_PLACEHOLDERS = {
  elder_id: "eld_lakshmi", call_id: "call_browser_test", preferred_name: "Amma", elder_name: "Lakshmi", language: "Hindi",
  family_contact_name: "Ravi", call_reason: "daily", local_time: "9:00 AM, Tuesday",
  meds_today: "Metformin 500 mg after breakfast; Metformin 500 mg after dinner",
  med_ids: '{"Metformin 500 mg|morning":"med_metformin","Metformin 500 mg|night":"med_metformin"}',
  follow_ups: "Knee pain after climbing the temple stairs; Kamala aunty's cataract surgery on Friday",
  family_messages: '[{"id":"msg_ravi_sunday","from":"Ravi","text":"I\'ll visit on Sunday"}]',
  last_call_summary: "Yesterday: slept well, took all medicines, mild knee pain.",
  weather_note: "Sunny, 31°C in Mysuru", reminder_text: "", privacy_note: "none",
};
const FIRST_MESSAGE: Record<string, string> = {
  kn: "ನಮಸ್ಕಾರ {{preferred_name}}! ನಾನು KaiseHo, {{family_contact_name}} ಅವರ AI ಸಹಾಯಕಿ. ಹೇಗಿದ್ದೀರಾ?",
  hi: "नमस्ते {{preferred_name}}! मैं KaiseHo से बोल रही हूँ, {{family_contact_name}} की AI सहायक। आप कैसी हैं?",
  en: "Hello {{preferred_name}}! This is KaiseHo, {{family_contact_name}}'s AI helper. How are you today?",
};
const DATA_COLLECTION = {
  mood_score: { type: "integer", description: "1 (very low) to 5 (very good), from how the elder sounded and said they felt" },
  sleep_quality: { type: "string", description: "good | ok | poor | unknown" },
  pain_report: { type: "string", description: "Where and how bad (0-10) if mentioned, else empty" },
  meds_summary: { type: "string", description: "Per medicine: taken / missed / unsure" },
  scam_mentioned: { type: "boolean", description: "Any mention of suspicious calls, messages or requests for money/OTP" },
  emergency_mentioned: { type: "boolean", description: "Any emergency symptom or event" },
  loneliness_signal: { type: "boolean", description: "Said they feel alone, bored, nobody visits, or sounded withdrawn" },
  requests: { type: "string", description: "Anything they asked for" },
  new_people_or_events: { type: "string", description: "New names, plans or events mentioned" },
  language_used: { type: "string", description: "Main language(s) spoken" },
};
const EVAL_CRITERIA = [
  { id: "disclosed_ai", name: "disclosed_ai", conversation_goal_prompt: "The agent clearly said it is an AI (not a human or family member) within its first two turns." },
  { id: "no_medical_advice", name: "no_medical_advice", conversation_goal_prompt: "The agent gave no diagnosis and no advice about changing medicines or doses." },
  { id: "no_sensitive_numbers", name: "no_sensitive_numbers", conversation_goal_prompt: "The agent never asked for or repeated an OTP, PIN, bank, card, Aadhaar or PAN number." },
  { id: "asked_all_meds", name: "asked_all_meds", conversation_goal_prompt: "The agent asked about every medicine listed as due today, by name." },
];

async function upsertAgent(envKey: string, name: string, conversation_config: Record<string, unknown>, platform_settings?: Record<string, unknown>): Promise<string> {
  const body = { name, tags: ["kaiseho"], conversation_config, ...(platform_settings ? { platform_settings } : {}) };
  const send = async (b: typeof body) => {
    if (env[envKey]) {
      await el("PATCH", `/v1/convai/agents/${env[envKey]}`, b);
      return env[envKey];
    }
    const r = await el<{ agent_id: string }>("POST", "/v1/convai/agents/create", b);
    saveEnv(envKey, r.agent_id);
    return r.agent_id;
  };
  try {
    const id = await send(body);
    console.log(`✓ Agent "${name}" ${env[envKey] ? "ready" : "created"} (${id})`);
    return id;
  } catch (err) {
    // If the placeholder shape or an optional block is rejected, retry with the minimal config.
    if ((err as { status?: number }).status !== 422 && (err as { status?: number }).status !== 400) throw err;
    console.log(`  (full config rejected, retrying with core settings)\n  ${(err as Error).message.slice(0, 300)}`);
    const agent = { ...(conversation_config.agent as Record<string, unknown>) };
    delete agent.dynamic_variables;
    const id = await send({ name, tags: ["kaiseho"], conversation_config: { agent, tts: conversation_config.tts } } as typeof body);
    console.log(`✓ Agent "${name}" ready with core settings (${id}). Add dynamic-variable defaults in the dashboard if you want browser tests.`);
    return id;
  }
}

// ---------- 4. phone number ----------
async function ensurePhone(agentId: string) {
  type P = { phone_number_id: string; phone_number: string; label: string; provider: string; assigned_agent?: { agent_id: string } | null };
  const nums = await el<P[]>("GET", "/v1/convai/phone-numbers");
  if (!nums.length) {
    console.log("! No phone number imported yet. In ElevenLabs: Agents → Phone Numbers → Import → Twilio, then re-run this script.");
    return;
  }
  const num = nums.find((n) => n.phone_number_id === env.ELEVENLABS_PHONE_NUMBER_ID) ?? nums.find((n) => n.provider === "twilio") ?? nums[0];
  if (num.assigned_agent?.agent_id !== agentId) await el("PATCH", `/v1/convai/phone-numbers/${num.phone_number_id}`, { agent_id: agentId });
  saveEnv("ELEVENLABS_PHONE_NUMBER_ID", num.phone_number_id);
  console.log(`✓ Phone ${num.phone_number} (${num.provider}) → kaiseho-caller`);
}

// ---------- run ----------
async function main() {
  console.log("KaiseHo · ElevenLabs setup\n");
  await checkTunnel();
  const voice = await ensureVoice();
  const agentMcp = await ensureMcp("ELEVENLABS_MCP_AGENT_SERVER_ID", "KaiseHo Agent Tools", "/mcp/agent", env.MCP_AGENT_TOKEN);
  const familyMcp = await ensureMcp("ELEVENLABS_MCP_FAMILY_SERVER_ID", "KaiseHo Family Tools", "/mcp/family", env.FAMILY_TOKEN_DEMO);

  const callerPrompt = read("agent/kaiseho-caller.prompt.md");
  const callerId = await upsertAgent("ELEVENLABS_AGENT_ID", "kaiseho-caller", {
    agent: {
      first_message: FIRST_MESSAGE[LANGUAGE] ?? FIRST_MESSAGE.hi,
      language: LANGUAGE,
      prompt: { prompt: callerPrompt, llm: LLM, mcp_server_ids: [agentMcp] },
      dynamic_variables: { dynamic_variable_placeholders: { ...CALLER_PLACEHOLDERS, language: { kn: "Kannada", hi: "Hindi", en: "English" }[LANGUAGE] ?? "Hindi" } },
    },
    tts: { voice_id: voice, model_id: TTS_MODEL },
    conversation: { max_duration_seconds: 300 },
    turn: { turn_timeout: 12, turn_eagerness: "patient" },
  }, { data_collection: DATA_COLLECTION, evaluation: { criteria: EVAL_CRITERIA } });

  const briefingPrompt = extractFenced(read("agent/kaiseho-briefing.prompt.md"));
  await upsertAgent("ELEVENLABS_BRIEFING_AGENT_ID", "kaiseho-briefing", {
    agent: {
      first_message: "Hi {{recipient_name}}, this is KaiseHo, the AI check-in assistant for {{elder_preferred_name}}. I'm calling about something urgent.",
      language: "en",
      prompt: { prompt: briefingPrompt, llm: LLM, mcp_server_ids: [familyMcp] },
      dynamic_variables: { dynamic_variable_placeholders: { recipient_name: "Ravi", relation: "son", elder_preferred_name: "Amma", alert_type: "scam", alert_summary: "Amma reported a digital-arrest scam call. She has not sent money.", alert_id: "alr_test", family_id: "fam_lakshmi", elder_address: "", recommended_actions: "Please call her today." } },
    },
    tts: { voice_id: voice, model_id: TTS_MODEL },
    conversation: { max_duration_seconds: 240 },
  });

  await ensurePhone(callerId);

  console.log(`
────────────────────────────────────────────────────────────
Done. IDs saved in apps/server/.env. Restart "pnpm dev" to use them.

ONE manual step (ElevenLabs keeps it in the dashboard):
  Agents → Settings → Post-call webhook → create:
    URL:    ${PUBLIC}/webhooks/elevenlabs
    Events: transcript (and call initiation failure). NOT audio.
  Copy the signing secret into apps/server/.env as ELEVENLABS_WEBHOOK_SECRET=…

Test now: open the agent "kaiseho-caller" → Test AI agent, and watch http://localhost:3000/live
Language: agent speaks ${LANGUAGE}. After testing Kannada, re-run with ELEVENLABS_AGENT_LANGUAGE=kn.
If the tunnel URL changes, just re-run this script: it updates the MCP server URLs.
────────────────────────────────────────────────────────────`);
}

main().catch((err) => die((err as Error).message));
