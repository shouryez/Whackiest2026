/**
 * One-command Twilio setup for KaiseHo (run after creating a Twilio account).
 *
 *   1. Put TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (and DEMO_ELDER_PHONE=+91…) in apps/server/.env
 *   2. pnpm setup:twilio
 *
 * It will:
 *   - check the account (trial or upgraded)
 *   - reuse your Twilio number, or get one voice-capable US number (the free trial number)
 *   - enable outbound calls to India (Voice Dialing Geo Permissions)
 *   - start verification of DEMO_ELDER_PHONE (trial accounts can only call verified numbers):
 *     Twilio calls that phone; whoever answers types the 6-digit code this script prints
 *   - import the number into ElevenLabs and assign the kaiseho-caller agent
 *   - write TWILIO_PHONE_NUMBER and ELEVENLABS_PHONE_NUMBER_ID back to apps/server/.env
 * Secrets are never printed. Re-running is safe.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dirname, "../apps/server/.env");
const env: Record<string, string> = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
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
function die(msg: string): never { console.error(`\n✗ ${msg}\n`); process.exit(1); }

const SID = env.TWILIO_ACCOUNT_SID;
const TOKEN = env.TWILIO_AUTH_TOKEN;
if (!SID?.startsWith("AC") || !TOKEN) die("Put TWILIO_ACCOUNT_SID (starts with AC) and TWILIO_AUTH_TOKEN in apps/server/.env first.");
const AUTH = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const E164 = (n: string) => n.replace(/[\s()-]/g, "");

async function tw<T = Record<string, unknown>>(method: string, url: string, form?: Record<string, string>): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `https://api.twilio.com/2010-04-01/Accounts/${SID}${url}`, {
    method,
    headers: { Authorization: AUTH, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 400)}`), { status: res.status });
  return (text ? JSON.parse(text) : {}) as T;
}
async function el<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io"}${path}`, {
    method, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  console.log("KaiseHo · Twilio setup\n");

  // 1. account
  const acct = await tw<{ friendly_name: string; type: string; status: string }>("GET", ".json").catch((e) => die(`Twilio rejected the SID/token: ${(e as Error).message.slice(0, 200)}`));
  const trial = acct.type === "Trial";
  console.log(`✓ Account "${acct.friendly_name}" · ${acct.type} · ${acct.status}`);

  // 2. phone number
  type Num = { sid: string; phone_number: string; capabilities: { voice: boolean } };
  const owned = (await tw<{ incoming_phone_numbers: Num[] }>("GET", "/IncomingPhoneNumbers.json?PageSize=20")).incoming_phone_numbers.filter((n) => n.capabilities.voice);
  let number = owned.find((n) => n.phone_number === E164(env.TWILIO_PHONE_NUMBER || "")) ?? owned[0];
  if (!number) {
    const avail = await tw<{ available_phone_numbers: { phone_number: string }[] }>("GET", "/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&PageSize=5");
    const pick = avail.available_phone_numbers[0]?.phone_number;
    if (!pick) die("No US numbers available right now. Buy one in the console (Phone Numbers → Buy a number) and re-run.");
    number = await tw<Num>("POST", "/IncomingPhoneNumbers.json", { PhoneNumber: pick, FriendlyName: "KaiseHo" });
    console.log(`✓ Got a new number: ${number.phone_number}${trial ? " (your free trial number)" : ""}`);
  } else {
    console.log(`✓ Using your number ${number.phone_number}`);
  }
  saveEnv("TWILIO_PHONE_NUMBER", number.phone_number);

  // 3. allow calls to India
  try {
    const cur = await tw<{ low_risk_numbers_enabled: boolean }>("GET", "https://voice.twilio.com/v1/DialingPermissions/Countries/IN");
    if (cur.low_risk_numbers_enabled) console.log("✓ Calls to India already allowed");
    else {
      await tw("POST", "https://voice.twilio.com/v1/DialingPermissions/BulkCountryUpdates", {
        UpdateRequest: JSON.stringify([{ iso_code: "IN", low_risk_numbers_enabled: "true", high_risk_special_numbers_enabled: "false", high_risk_tollfraud_numbers_enabled: "false" }]),
      });
      console.log("✓ Enabled outbound calls to India (Geo Permissions)");
    }
  } catch (e) {
    console.log(`! Couldn't change Geo Permissions automatically. In the console: Voice → Settings → Geo permissions → tick India.\n  ${(e as Error).message.slice(0, 160)}`);
  }

  // 4. verify the demo elder phone (trial accounts only call verified numbers)
  const target = E164(env.DEMO_ELDER_PHONE || "");
  if (!target) {
    console.log("! DEMO_ELDER_PHONE is empty: add the phone that plays Amma (+91…) and re-run to verify it.");
  } else if (trial) {
    const ids = (await tw<{ outgoing_caller_ids: { phone_number: string }[] }>("GET", "/OutgoingCallerIds.json?PageSize=50")).outgoing_caller_ids.map((c) => c.phone_number);
    if (ids.includes(target)) console.log(`✓ ${target} is verified`);
    else {
      const v = await tw<{ validation_code: string }>("POST", "/OutgoingCallerIds.json", { PhoneNumber: target, FriendlyName: "KaiseHo demo Amma" });
      console.log(`\n📞 Twilio is calling ${target} now.\n   Answer it and type this code on the keypad:  ${v.validation_code}\n   Then re-run "pnpm setup:twilio" to confirm.\n`);
    }
  } else {
    console.log("✓ Upgraded account: any number can be called");
  }

  // 5. import into ElevenLabs + assign the caller agent
  if (!env.ELEVENLABS_API_KEY) die("ELEVENLABS_API_KEY missing; can't import into ElevenLabs.");
  type P = { phone_number_id: string; phone_number: string; assigned_agent?: { agent_id: string } | null };
  const existing = (await el<P[]>("GET", "/v1/convai/phone-numbers")).find((p) => p.phone_number === number!.phone_number);
  const phoneId = existing?.phone_number_id ?? (await el<{ phone_number_id: string }>("POST", "/v1/convai/phone-numbers", {
    provider: "twilio", phone_number: number.phone_number, label: "KaiseHo (Twilio)", sid: SID, token: TOKEN,
  })).phone_number_id;
  if (env.ELEVENLABS_AGENT_ID && existing?.assigned_agent?.agent_id !== env.ELEVENLABS_AGENT_ID) {
    await el("PATCH", `/v1/convai/phone-numbers/${phoneId}`, { agent_id: env.ELEVENLABS_AGENT_ID });
  }
  saveEnv("ELEVENLABS_PHONE_NUMBER_ID", phoneId);
  console.log(`✓ ${existing ? "Already in" : "Imported into"} ElevenLabs and assigned to kaiseho-caller (${phoneId})`);

  console.log(`
────────────────────────────────────────────────────────────
Done. Restart "pnpm dev", then press "Call Amma now" on the dashboard.
${trial ? "Trial account: calls start with a short Twilio trial message, and only verified numbers can be called.\nAdd ~$20 credit (Billing) before demo day to remove both limits." : ""}
────────────────────────────────────────────────────────────`);
}
main().catch((e) => die((e as Error).message));
