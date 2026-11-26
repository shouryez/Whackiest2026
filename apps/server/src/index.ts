import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "./env";
import { elevenLabsReady } from "./engine/calls";
import { llmEnabled } from "./engine/llm";
import { setTelegramWebhook, telegramEnabled } from "./engine/notify/telegram";
import { handleElevenLabsWebhook } from "./engine/postcall";
import { handleAgentMcp } from "./mcp/agentServer";
import { handleFamilyMcp } from "./mcp/familyServer";
import { handleClinicMcp } from "./mcp/clinicServer";
import { callElder, startDailyTicker } from "./packs/kaiseho/calls";
import { kaisehoPostCall, startPurgeJob } from "./packs/kaiseho/postcall";
import { DEMO, seedDemo } from "./packs/kaiseho/seed";
import { getRepo } from "./repo";
import { readAudio } from "./engine/tts";
import { startDigestTicker } from "./packs/kaiseho/digest";
import { initJobs } from "./packs/kaiseho/jobs";
import { Job, runJob, scheduleJob } from "./engine/jobs";
import { api } from "./routes/api";
import { telegramRoutes } from "./routes/telegram";

const app = new Hono();
const repo = getRepo();

// ---------- auth ----------
function safeEq(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}
function bearer(c: Context): string {
  const h = c.req.header("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : c.req.query("token") ?? "";
}
const requireToken = (token: () => string) => async (c: Context, next: Next) => {
  if (!safeEq(bearer(c), token())) return c.json({ error: "unauthorized" }, 401);
  await next();
};
const agentAuth = requireToken(() => env.MCP_AGENT_TOKEN);
/** Hackathon: one family token = Ravi (primary) of the demo family. Real sessions/OAuth later. */
const familyAuth = requireToken(() => env.FAMILY_TOKEN_DEMO);
const internalAuth = requireToken(() => env.INTERNAL_TOKEN);
const clinicAuth = requireToken(() => env.CLINIC_MCP_TOKEN);

// ---------- health ----------
app.get("/health", async (c) =>
  c.json({
    ok: true, service: "ek-call-server", pack: "kaiseho", dataStore: env.DATA_STORE, demoMode: env.DEMO_MODE,
    elevenlabs: elevenLabsReady(), telegram: telegramEnabled(), llm: llmEnabled() ? env.LLM_PROVIDER : "rules",
    mcpAgent: `${env.PUBLIC_BASE_URL}/mcp/agent`, mcpFamily: `${env.PUBLIC_BASE_URL}/mcp/family`,
    elders: (await repo.listEldersByFamily(DEMO.familyId)).length,
  }),
);

// ---------- MCP: one brain, two doors ----------
app.all("/mcp/agent", agentAuth, (c) => handleAgentMcp(c.req.raw));
app.all("/mcp/clinic", clinicAuth, (c) => handleClinicMcp(c.req.raw));
app.all("/mcp/family", familyAuth, (c) => handleFamilyMcp(c.req.raw, { familyId: DEMO.familyId, memberId: "mem_ravi", name: "Ravi" }));

// ---------- webhooks ----------
app.post("/webhooks/elevenlabs", async (c) => {
  const raw = await c.req.text();
  const r = await handleElevenLabsWebhook(raw, c.req.header("elevenlabs-signature"), kaisehoPostCall);
  return c.json(r.body, r.status as 200);
});
app.route("/webhooks/telegram", telegramRoutes);

// ---------- internal (Lambda / scripts) ----------
app.post("/internal/calls/start", internalAuth, async (c) => {
  const b = z.object({ elderId: z.string(), reason: z.string().default("daily"), extras: z.record(z.string(), z.string()).optional() }).parse(await c.req.json());
  const elder = await repo.getElder(b.elderId);
  if (!elder) return c.json({ error: "unknown elder" }, 404);
  const { call, dynamicVariables } = await callElder(elder, b.reason, b.extras);
  return c.json({ ok: true, callId: call.callId, mode: call.mode, dynamicVariables });
});
// EventBridge Scheduler → job-runner Lambda → here.
app.post("/internal/jobs/run", internalAuth, async (c) => {
  const body = (await c.req.json()) as { job?: unknown };
  const job = Job.parse(body.job ?? body);
  await runJob(job);
  return c.json({ ok: true, ran: job.type });
});
// Phase 4 acceptance: schedule a short test call N minutes from now through the real scheduler
// (EventBridge → Lambda → /internal/jobs/run on AWS, a local timer otherwise).
app.post("/internal/test/schedule-call", internalAuth, async (c) => {
  const minutes = Math.min(60, Math.max(1, Number(c.req.query("minutes") ?? 2)));
  const when = new Date(Date.now() + minutes * 60_000);
  const backend = await scheduleJob(`test-call-${Date.now()}`, when, { type: "call", elderId: DEMO.elderId, reason: "quicktest" });
  return c.json({ ok: true, backend, at: when.toISOString() });
});
app.post("/internal/demo/seed", internalAuth, async (c) => { await seedDemo({ resetEvents: true }); return c.json({ ok: true }); });
app.post("/internal/telegram/set-webhook", internalAuth, async (c) =>
  c.json({ ok: await setTelegramWebhook(`${env.PUBLIC_BASE_URL}/webhooks/telegram/${env.TELEGRAM_WEBHOOK_SECRET}`) }));

// ---------- media (digest MP3s; family token via ?token= so <audio> can play it) ----------
app.get("/media/digests/:file", familyAuth, async (c) => {
  const buf = await readAudio(c.req.param("file") ?? "");
  if (!buf) return c.json({ error: "not found" }, 404);
  return c.body(new Uint8Array(buf), 200, { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" });
});

// ---------- dashboard API ----------
app.use("/api/*", cors({ origin: (o) => o ?? "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
app.use("/api/*", async (c, next) => (c.req.method === "OPTIONS" ? next() : familyAuth(c, next)));
app.route("/api", api);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof z.ZodError ? "bad request" : "internal error" }, err instanceof z.ZodError ? 400 : 500);
});

// ---------- boot ----------
// Seed only an empty store: on DynamoDB a restart must never wipe real history.
if (env.DEMO_MODE && !(await repo.getFamily(DEMO.familyId))) await seedDemo();
startPurgeJob();
await initJobs();
startDailyTicker();
startDigestTicker();
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Ek Call server (KaiseHo pack) on http://localhost:${info.port}`);
  console.log(`  MCP doors: ${env.PUBLIC_BASE_URL}/mcp/agent (voice agent) · ${env.PUBLIC_BASE_URL}/mcp/family (Claude)`);
  console.log(`  ElevenLabs: ${elevenLabsReady() ? "live calls" : "simulated calls"} · Telegram: ${telegramEnabled() ? "on" : "off"} · LLM: ${llmEnabled() ? env.LLM_PROVIDER : "rules"} · data: ${env.DATA_STORE}`);
});

export { app };
