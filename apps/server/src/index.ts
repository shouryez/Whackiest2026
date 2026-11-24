import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { timingSafeEqual } from "node:crypto";
import type { LiveEvent } from "@kaiseho/shared";
import { env } from "./env";
import { bus, eventsSince, lastEventId } from "./engine/events";
import { telegramEnabled } from "./engine/notify/telegram";
import { handleAgentMcp } from "./mcp/agentServer";
import { ackAlert, createAlert } from "./packs/kaiseho/alerts";
import { DEMO, seedDemo } from "./packs/kaiseho/seed";
import { todayView } from "./packs/kaiseho/views";
import { getRepo } from "./repo";

const app = new Hono();
const repo = getRepo();

app.use("/api/*", cors({ origin: (o) => o ?? "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] }));

// ---------- auth helpers ----------
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
/** Phase 0: one demo family token guards the dashboard API. Real sessions arrive in Phase 2. */
const familyAuth = requireToken(() => env.FAMILY_TOKEN_DEMO);
const agentAuth = requireToken(() => env.MCP_AGENT_TOKEN);
const internalAuth = requireToken(() => env.INTERNAL_TOKEN);

// ---------- health ----------
app.get("/health", async (c) =>
  c.json({
    ok: true,
    service: "ek-call-server",
    pack: "kaiseho",
    dataStore: env.DATA_STORE,
    demoMode: env.DEMO_MODE,
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    telegram: telegramEnabled(),
    mcpAgent: `${env.PUBLIC_BASE_URL}/mcp/agent`,
    elders: (await repo.listEldersByFamily(DEMO.familyId)).length,
  }),
);

// ---------- MCP: the voice agent's door ----------
app.all("/mcp/agent", agentAuth, (c) => handleAgentMcp(c.req.raw));

// ---------- dashboard API ----------
app.use("/api/*", async (c, next) => (c.req.method === "OPTIONS" ? next() : familyAuth(c, next)));

app.get("/api/family/overview", async (c) => {
  const family = await repo.getFamily(DEMO.familyId);
  if (!family) return c.json({ error: "no family; seed first" }, 404);
  const elders = await repo.listEldersByFamily(family.familyId);
  const alerts = await repo.listAlerts(family.familyId);
  const members = await repo.listMembers(family.familyId);
  return c.json({
    family: { familyId: family.familyId, name: family.name },
    members: members.map((m) => ({ name: m.name, relation: m.relation, role: m.role, telegramLinked: Boolean(m.telegramChatId) })),
    elders: await Promise.all(elders.map((e) => todayView(e))),
    alerts: alerts.slice(0, 30),
  });
});

app.get("/api/elders/:id", async (c) => {
  const elder = await repo.getElder(c.req.param("id"));
  if (!elder) return c.json({ error: "not found" }, 404);
  return c.json(await todayView(elder));
});

app.get("/api/elders/:id/audit", async (c) => c.json((await repo.listAudit(c.req.param("id"))).slice(0, 200)));

app.get("/api/alerts", async (c) => c.json(await repo.listAlerts(DEMO.familyId)));

app.post("/api/alerts/:id/ack", async (c) => {
  const a = await ackAlert(c.req.param("id"), "family:mem_ravi");
  return a ? c.json({ ok: true, alert: a }) : c.json({ error: "not found" }, 404);
});

// ---------- live events: polling + SSE ----------
app.get("/api/live/events", (c) => {
  const since = Number(c.req.query("since") ?? 0) || 0;
  return c.json({ last: lastEventId(), events: eventsSince(since, DEMO.familyId) });
});

app.get("/api/live/stream", (c) =>
  streamSSE(c, async (stream) => {
    const since = Number(c.req.query("since") ?? 0) || 0;
    for (const ev of eventsSince(since, DEMO.familyId)) await stream.writeSSE({ id: String(ev.id), event: ev.type, data: JSON.stringify(ev) });
    const onEvent = (ev: LiveEvent) => {
      if (ev.familyId !== DEMO.familyId) return;
      void stream.writeSSE({ id: String(ev.id), event: ev.type, data: JSON.stringify(ev) });
    };
    bus.on("event", onEvent);
    stream.onAbort(() => {
      bus.off("event", onEvent);
    });
    while (!stream.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ event: "ping", data: "{}" });
    }
  }),
);

// ---------- demo controls (DEMO_MODE only) ----------
const demo = new Hono();
demo.use("*", async (c, next) => (env.DEMO_MODE ? next() : c.json({ error: "demo mode off" }, 403)));
demo.post("/seed", async (c) => {
  await seedDemo({ resetEvents: true });
  return c.json({ ok: true, familyId: DEMO.familyId, elderId: DEMO.elderId });
});
demo.post("/simulate-scam-alert", async (c) => {
  // Fallback if the live call fails on stage: the same alert path the tool uses.
  const elder = await repo.getElder(DEMO.elderId);
  if (!elder) return c.json({ error: "seed first" }, 404);
  const alert = await createAlert({
    elder, severity: "urgent", type: "scam", title: "Scam attempt blocked",
    body: `${elder.preferredName} told KaiseHo a "CBI officer" asked her to stay on a video call about her Aadhaar.`,
    data: { pattern: "digital_arrest", score: 0.95, simulated: true },
    telegramLines: ["✅ She has NOT sent money. KaiseHo told her it's a scam and to hang up.", "👉 Please call her today. Cyber helpline: 1930"],
  });
  return c.json({ ok: true, alert });
});
app.route("/api/demo", demo);

// Internal (scripts, Lambda): same demo seed behind the internal token.
app.post("/internal/demo/seed", internalAuth, async (c) => {
  await seedDemo({ resetEvents: true });
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

// ---------- boot ----------
if (env.DEMO_MODE) await seedDemo();
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Ek Call server (KaiseHo pack) on http://localhost:${info.port}`);
  console.log(`  MCP agent door: ${env.PUBLIC_BASE_URL}/mcp/agent  (Bearer MCP_AGENT_TOKEN)`);
  console.log(`  Telegram: ${telegramEnabled() ? "on" : "off (alerts go to the dashboard only)"} · data: ${env.DATA_STORE}${env.DEMO_MODE ? " · demo seeded" : ""}`);
});

export { app };
