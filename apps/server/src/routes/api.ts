import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Slot, type LiveEvent } from "@kaiseho/shared";
import { redactPII } from "../control/redact";
import { env } from "../env";
import { elevenLabsReady } from "../engine/calls";
import { bus, emit, eventsSince, lastEventId } from "../engine/events";
import { localDate, newId, nowIso } from "../engine/ids";
import { llmEnabled } from "../engine/llm";
import { telegramEnabled } from "../engine/notify/telegram";
import { ackAlert, createAlert } from "../packs/kaiseho/alerts";
import { callElder, onNoAnswer } from "../packs/kaiseho/calls";
import { playDemoCall } from "../packs/kaiseho/demoCall";
import { raiseEmergency } from "../packs/kaiseho/emergency";
import { storedToday, timeline, trends, weeklySummary } from "../packs/kaiseho/family";
import { computeNudge, conversationStarters, familyCallStats, logFamilyCall } from "../packs/kaiseho/nudges";
import { purgeTranscripts } from "../packs/kaiseho/postcall";
import { buildDigest } from "../packs/kaiseho/digest";
import { detectChanges, doctorBrief, drillScore, refills } from "../packs/kaiseho/health";
import { callClinic, requestAppointment } from "../packs/kaiseho/clinic";
import { parseImage, PrescriptionError, readPrescription } from "../packs/kaiseho/prescription";
import { ttsReady } from "../engine/tts";
import { DEMO, seedDemo } from "../packs/kaiseho/seed";
import { filterForFamily, todayView } from "../packs/kaiseho/views";
import { getRepo } from "../repo";
import { ToolRejected } from "../control/tiers";
import { cancelReminder, createReminder, localToUtc, upcomingReminders } from "../packs/kaiseho/reminders";
import { addOccasion, upcomingOccasions } from "../packs/kaiseho/occasions";
import { lifeCertStatus, logLifeCert } from "../packs/kaiseho/pension";
import { sharedReadback } from "../packs/kaiseho/transparency";

/** Dashboard REST API (plan.md Section 12.1). Family-scoped; every output via filterForFamily. */
export const api = new Hono();
const repo = getRepo();
const ACTOR = "family:mem_ravi"; // Phase 2 hackathon auth = one family token; real sessions later.

async function elderOr404(id: string) {
  const e = await repo.getElder(id);
  if (!e || e.familyId !== DEMO.familyId) throw Object.assign(new Error("not found"), { status: 404 });
  return e;
}
api.onError((err, c) => {
  const status = (err as { status?: number }).status ?? (err instanceof ToolRejected || err instanceof z.ZodError ? 400 : 500);
  const msg = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
  return c.json({ error: msg }, status as 400);
});

api.get("/health/integrations", (c) => c.json({
  elevenlabs: elevenLabsReady(), briefing: elevenLabsReady(env.ELEVENLABS_BRIEFING_AGENT_ID), telegram: telegramEnabled(),
  llm: llmEnabled() ? env.LLM_PROVIDER : "rules", dataStore: env.DATA_STORE, region: "ap-south-1 (planned)", demoMode: env.DEMO_MODE,
}));

api.get("/family/overview", async (c) => {
  const family = await repo.getFamily(DEMO.familyId);
  if (!family) return c.json({ error: "no family; seed first" }, 404);
  const elders = await repo.listEldersByFamily(family.familyId);
  const members = await repo.listMembers(family.familyId);
  const alerts = await repo.listAlerts(family.familyId);
  const cards = await Promise.all(elders.map(async (e) => {
    const calls = await repo.listCalls(e.elderId);
    const last = calls.find((x) => x.summary) ?? calls[0];
    const nudge = (await repo.listNudges(e.elderId)).find((n) => n.status === "open");
    const openUrgent = alerts.filter((a) => a.elderId === e.elderId && a.status === "open" && (a.severity === "urgent" || a.severity === "emergency"));
    const today = await todayView(e);
    const calledToday = calls.some((x) => x.startedAt && localDate(e.tz, new Date(x.startedAt)) === today.date && x.status === "completed");
    const ring = openUrgent.length ? "red" : (today.wellbeing?.mood ?? 5) <= 2 || today.meds.some((m) => m.status === "missed") ? "amber" : calledToday ? "green" : "grey";
    const live = calls.find((x) => x.status === "ringing" || x.status === "in_progress");
    return { ...today, ring, lastCall: last ? { callId: last.callId, at: last.startedAt, status: last.status, summary: last.summary, mode: last.mode } : null, liveCall: live ? { callId: live.callId, status: live.status, mode: live.mode } : null, nudge, familyCalls: await familyCallStats(e), openUrgent: openUrgent.length };
  }));
  return c.json({
    family: { familyId: family.familyId, name: family.name },
    members: members.map((m) => ({ memberId: m.memberId, name: m.name, relation: m.relation, role: m.role, telegramLinked: Boolean(m.telegramChatId), linkCode: m.role !== "neighbour" ? m.name.toLowerCase() : undefined })),
    elders: cards,
    alerts: alerts.slice(0, 40),
  });
});

api.get("/elders/:id", async (c) => c.json(await todayView(await elderOr404(c.req.param("id")))));
api.get("/elders/:id/profile", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const consent = await repo.getLatestConsent(e.elderId);
  return c.json({ elder: { ...e, phone: e.phone.replace(/\d(?=\d{3})/g, "•"), clinics: (e.clinics ?? []).map((k) => ({ ...k, phone: k.phone.replace(/\d(?=\d{3})/g, "•") })) }, consent, meds: (await repo.listMedications(e.elderId)).filter((m) => m.active), reminders: (await repo.listReminders(e.elderId)).filter((r) => r.status === "scheduled") });
});
api.get("/elders/:id/timeline", async (c) => c.json(await timeline(await elderOr404(c.req.param("id")), Number(c.req.query("days") ?? 14))));
api.get("/elders/:id/trends", async (c) => c.json(await trends(await elderOr404(c.req.param("id")), Number(c.req.query("days") ?? 14))));
api.get("/elders/:id/weekly", async (c) => c.json(await weeklySummary(await elderOr404(c.req.param("id")))));
api.get("/elders/:id/memories", async (c) => {
  const { memories, privateCount } = await filterForFamily(await elderOr404(c.req.param("id")));
  return c.json({ memories: memories.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), privateCount });
});
api.get("/elders/:id/starters", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  return c.json({ starters: await conversationStarters(e), nudge: (await repo.listNudges(e.elderId)).find((n) => n.status === "open") ?? null, familyCalls: await familyCallStats(e) });
});
api.get("/elders/:id/messages", async (c) => c.json((await repo.listMessages((await elderOr404(c.req.param("id"))).elderId)).slice().reverse()));
api.get("/elders/:id/audit", async (c) => c.json((await repo.listAudit((await elderOr404(c.req.param("id"))).elderId)).slice(0, 300)));
api.get("/elders/:id/transcript/:callId", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const turns = await repo.listTurns(c.req.param("callId"));
  return c.json({ turns: turns.filter((t) => t.elderId === e.elderId), purgeAt: turns[0]?.purgeAt ?? null, note: `Redacted. Raw turns are deleted ${env.TRANSCRIPT_RETENTION_HOURS} h after the call.` });
});
api.get("/elders/:id/privacy", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const { privateCount } = await filterForFamily(e);
  return c.json({
    choices: e.privacy, privateCount, consent: await repo.getLatestConsent(e.elderId) ?? null, storedToday: await storedToday(e),
    retention: { audio: "never requested or stored", transcriptHours: env.TRANSCRIPT_RETENTION_HOURS, kept: "short summaries + structured fields (meds yes/no, mood 1–5, pain 0–10, flags)" },
    location: env.DATA_STORE === "dynamo" ? "AWS ap-south-1 (Mumbai)" : "in-memory on our server (AWS Mumbai in production)",
    safetyExceptions: ["scam attempts", "emergencies", "self-harm statements", "missed calls (no answer)"],
  });
});

const MedBody = z.object({ name: z.string().min(2).max(60), dose: z.string().min(1).max(30), slots: z.array(Slot).min(1), withFood: z.enum(["before", "after", "any"]).optional(), stockCount: z.number().int().min(0).max(1000).optional() });
api.post("/elders/:id/medications", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = MedBody.parse(await c.req.json());
  const med = { elderId: e.elderId, medId: newId("med"), ...b, startDate: localDate(e.tz), refillThresholdDays: 3, active: true, addedBy: ACTOR };
  await repo.putMedication(med);
  emit("tool.called", e.familyId, { tool: "add_medication", tier: "T2", label: `💊 Medication added by Ravi: ${b.name} ${b.dose} (${b.slots.join(", ")})`, actor: ACTOR }, e.elderId);
  return c.json({ ok: true, med });
});
api.delete("/elders/:id/medications/:medId", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const med = (await repo.listMedications(e.elderId)).find((m) => m.medId === c.req.param("medId"));
  if (!med) return c.json({ error: "not found" }, 404);
  med.active = false; med.endDate = localDate(e.tz);
  await repo.putMedication(med);
  return c.json({ ok: true });
});
api.post("/elders/:id/messages", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ text: z.string().min(1).max(300), fromName: z.string().min(1).max(40).default("Ravi") }).parse(await c.req.json());
  const msg = { elderId: e.elderId, messageId: newId("msg"), direction: "to_elder" as const, fromName: b.fromName, text: redactPII(b.text), delivered: false, createdAt: nowIso() };
  await repo.putMessage(msg);
  emit("message.queued", e.familyId, { message: msg }, e.elderId);
  return c.json({ ok: true, message: msg, note: `Will be delivered in the next call at ${e.callTimeLocal}.` });
});
api.post("/elders/:id/call-now", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ quick: z.boolean().default(false) }).parse(await c.req.json().catch(() => ({})));
  // quick = ~45 s system test (saves ElevenLabs credits while testing)
  const { call } = await callElder(e, b.quick ? "quicktest" : "checkin");
  return c.json({ ok: true, callId: call.callId, mode: call.mode });
});
api.post("/elders/:id/family-call", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ by: z.string().default("Ravi") }).parse(await c.req.json().catch(() => ({})));
  await logFamilyCall(e, b.by, "button");
  return c.json({ ok: true, familyCalls: await familyCallStats(e) });
});
api.patch("/elders/:id/schedule", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ callTimeLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(), status: z.enum(["active", "paused"]).optional(), pausedUntil: z.string().optional() }).parse(await c.req.json());
  Object.assign(e, b);
  await repo.putElder(e);
  emit("schedule.updated", e.familyId, { ...b, by: "family" }, e.elderId);
  return c.json({ ok: true });
});
api.post("/alerts/:id/ack", async (c) => {
  const a = await ackAlert(c.req.param("id"), ACTOR);
  return a ? c.json({ ok: true, alert: a }) : c.json({ error: "not found" }, 404);
});
api.get("/alerts", async (c) => c.json(await repo.listAlerts(DEMO.familyId)));
api.post("/family/delete-all", async (c) => {
  await repo.deleteFamilyData(DEMO.familyId);
  emit("demo.reset", DEMO.familyId, { deleted: true });
  return c.json({ ok: true, note: "All family data deleted. (Demo: use Reset to seed again.)" });
});

// ---------- health: refills, changes, scam drills, doctor brief (Phase 5) ----------
api.get("/elders/:id/health", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  return c.json({ refills: await refills(e), changes: await detectChanges(e), drills: await drillScore(e) });
});
api.get("/elders/:id/doctor-brief", async (c) => c.json(await doctorBrief(await elderOr404(c.req.param("id")), Number(c.req.query("days") ?? 30))));
api.patch("/elders/:id/medications/:medId", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ stockCount: z.number().int().min(0).max(1000) }).parse(await c.req.json());
  const med = (await repo.listMedications(e.elderId)).find((m) => m.medId === c.req.param("medId"));
  if (!med) return c.json({ error: "not found" }, 404);
  med.stockCount = b.stockCount;
  await repo.putMedication(med);
  return c.json({ ok: true });
});

// ---------- prescription photo → draft schedule (P2-2). Never auto-saved; the photo is not stored. ----------
api.post("/elders/:id/prescription", async (c) => {
  await elderOr404(c.req.param("id"));
  const b = z.object({ image: z.string().min(100), mediaType: z.string().optional() }).parse(await c.req.json());
  try {
    const draft = await readPrescription(parseImage(b.image, b.mediaType));
    return c.json({ ok: true, ...draft, note: "Draft only: check every row against the prescription before saving." });
  } catch (err) {
    if (err instanceof PrescriptionError) return c.json({ ok: false, error: err.message }, err.status);
    throw err;
  }
});

// ---------- clinics + appointments (P2-14) ----------
api.get("/elders/:id/appointments", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  return c.json({ clinics: e.clinics ?? [], appointments: await repo.listAppointments(e.elderId) });
});
api.post("/elders/:id/appointments", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ preferred: z.string().min(2).max(80), clinicId: z.string().optional(), note: z.string().max(120).optional() }).parse(await c.req.json());
  return c.json({ ok: true, appointment: await requestAppointment(e, { preferred: b.preferred, clinicId: b.clinicId, reason: b.note, requestedBy: ACTOR }) });
});
api.post("/elders/:id/appointments/:apptId/call", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const a = await repo.getAppointment(e.elderId, c.req.param("apptId"));
  if (!a) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, appointment: await callClinic(e, a) });
});
api.put("/elders/:id/clinics", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ name: z.string().min(2).max(60), doctor: z.string().min(2).max(60), phone: z.string().regex(/^\+?\d[\d\s-]{8,15}$/) }).parse(await c.req.json());
  e.clinics = [{ clinicId: newId("clinic"), name: b.name, doctor: b.doctor, phone: b.phone.replace(/[\s-]/g, "") }, ...(e.clinics ?? [])].slice(0, 3);
  await repo.putElder(e);
  return c.json({ ok: true, clinics: e.clinics });
});

// ---------- reminders & callbacks (P2-11) ----------
api.get("/elders/:id/reminders", async (c) => c.json({ reminders: await upcomingReminders(await elderOr404(c.req.param("id"))) }));
api.post("/elders/:id/reminders", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ text: z.string().min(2).max(200), whenLocalIso: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) }).parse(await c.req.json());
  const r = await createReminder(e, { kind: "reminder", text: b.text, when: localToUtc(b.whenLocalIso, e.tz), createdBy: ACTOR });
  emit("tool.called", e.familyId, { tool: "set_reminder_for_elder", tier: "T2", label: `⏰ Ravi set a reminder call ${r.whenSpoken}: "${r.text}"`, actor: ACTOR }, e.elderId);
  return c.json({ ok: true, reminder: r });
});
api.post("/elders/:id/reminders/:rid/cancel", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  return c.json({ ok: true, reminder: await cancelReminder(e, c.req.param("rid"), ACTOR) });
});

// ---------- occasions (P2-10) ----------
api.get("/elders/:id/occasions", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const saved = (await repo.listOccasions(e.familyId)).filter((o) => !o.elderId || o.elderId === e.elderId);
  return c.json({ upcoming: await upcomingOccasions(e, Number(c.req.query("days") ?? 60)), saved });
});
api.post("/elders/:id/occasions", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({
    title: z.string().min(2).max(80), date: z.string(), kind: z.enum(["birthday", "anniversary", "festival", "other"]),
    person: z.string().max(40).optional(), relation: z.string().max(30).optional(), isElders: z.boolean().optional(),
  }).parse(await c.req.json());
  return c.json({ ok: true, occasion: await addOccasion(e.familyId, { ...b, elderId: e.elderId, createdBy: ACTOR }) });
});
api.delete("/elders/:id/occasions/:oid", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  await repo.deleteOccasion(e.familyId, c.req.param("oid"));
  return c.json({ ok: true });
});

// ---------- pension life certificate (P2-9) ----------
api.get("/elders/:id/pension", async (c) => c.json(lifeCertStatus(await elderOr404(c.req.param("id")))));
api.put("/elders/:id/pension", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ pensioner: z.boolean(), disbursedBy: z.string().max(60).optional(), kind: z.enum(["central", "state", "defence", "epfo", "bank", "other"]).optional() }).parse(await c.req.json());
  e.pension = { ...(e.pension ?? {}), ...b, disbursedBy: b.disbursedBy ? redactPII(b.disbursedBy) : undefined };
  await repo.putElder(e);
  return c.json({ ok: true, ...lifeCertStatus(e) });
});
api.post("/elders/:id/pension/life-cert", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  const b = z.object({ status: z.enum(["done", "not_yet", "needs_help"]), method: z.string().max(60).optional() }).parse(await c.req.json());
  await logLifeCert(e, b.status, ACTOR, b.method);
  emit("tool.called", e.familyId, { tool: "mark_life_certificate", tier: "T1", label: `🪪 Life certificate marked ${b.status.replace("_", " ")} by Ravi`, actor: ACTOR }, e.elderId);
  return c.json({ ok: true, ...lifeCertStatus(e) });
});

// ---------- transparency (P2-13): what she hears when she asks "what did you tell Ravi?" ----------
api.get("/elders/:id/shared-readback", async (c) => c.json(await sharedReadback(await elderOr404(c.req.param("id")), Number(c.req.query("days") ?? 3))));

// ---------- weekly audio digest ----------
api.get("/elders/:id/digests", async (c) => c.json((await repo.listDigests((await elderOr404(c.req.param("id"))).elderId)).slice(0, 6)));
api.post("/elders/:id/digest", async (c) => c.json({ ok: true, digest: await buildDigest(await elderOr404(c.req.param("id"))), tts: ttsReady() }));

// ---------- onboarding (P1-9): family adds a parent; no schedule until she consents ----------
const CITY: Record<string, [number, number]> = {
  mysuru: [12.2958, 76.6394], mysore: [12.2958, 76.6394], bengaluru: [12.9716, 77.5946], bangalore: [12.9716, 77.5946], mumbai: [19.076, 72.8777],
  pune: [18.5204, 73.8567], delhi: [28.6139, 77.209], "new delhi": [28.6139, 77.209], chennai: [13.0827, 80.2707], hyderabad: [17.385, 78.4867],
  kolkata: [22.5726, 88.3639], jaipur: [26.9124, 75.7873], lucknow: [26.8467, 80.9462], ahmedabad: [23.0225, 72.5714], kochi: [9.9312, 76.2673],
  mangaluru: [12.9141, 74.856], hubballi: [15.3647, 75.124], indore: [22.7196, 75.8577], patna: [25.5941, 85.1376], bhopal: [23.2599, 77.4126],
};
const OnboardBody = z.object({
  elder: z.object({
    name: z.string().min(2).max(40), preferredName: z.string().min(1).max(20), gender: z.enum(["female", "male", "other"]).optional(), age: z.number().int().min(40).max(110).optional(),
    language: z.enum(["kn", "hi", "en"]), phone: z.string().regex(/^\+?\d[\d\s-]{8,15}$/), city: z.string().min(2).max(40),
    callTimeLocal: z.string().regex(/^\d{2}:\d{2}$/), conditions: z.array(z.string().max(40)).max(8).default([]),
  }),
  medicines: z.array(z.object({ name: z.string().min(2).max(60), dose: z.string().min(1).max(30), slots: z.array(Slot).min(1) })).max(12).default([]),
});
api.post("/onboard", async (c) => {
  const b = OnboardBody.parse(await c.req.json());
  const [lat, lon] = CITY[b.elder.city.trim().toLowerCase()] ?? [undefined, undefined];
  const elderId = newId("eld");
  await repo.putElder({
    elderId, familyId: DEMO.familyId, name: b.elder.name, preferredName: b.elder.preferredName, gender: b.elder.gender === "other" ? undefined : b.elder.gender, age: b.elder.age,
    languages: b.elder.language === "en" ? ["en"] : [b.elder.language, "en"], primaryLanguage: b.elder.language,
    phone: b.elder.phone.replace(/[\s-]/g, ""), city: b.elder.city, lat, lon, tz: "Asia/Kolkata", callTimeLocal: b.elder.callTimeLocal,
    callDays: [0, 1, 2, 3, 4, 5, 6], conditions: b.elder.conditions, status: "pending_consent",
    privacy: { shareMedicines: true, shareWellbeing: true, shareMemories: true }, createdAt: nowIso(),
  });
  for (const m of b.medicines) {
    await repo.putMedication({ elderId, medId: newId("med"), name: m.name, dose: m.dose, slots: m.slots, startDate: localDate("Asia/Kolkata"), refillThresholdDays: 3, active: true, addedBy: ACTOR });
  }
  emit("schedule.updated", DEMO.familyId, { status: "pending_consent", by: "family", onboarded: b.elder.preferredName }, elderId);
  return c.json({ ok: true, elderId });
});
api.post("/elders/:id/welcome-call", async (c) => {
  const e = await elderOr404(c.req.param("id"));
  if (env.DEMO_MODE && !elevenLabsReady()) return c.json({ ok: true, mode: "simulated", ...(await playDemoCall(e, { kind: "consent", pauseMs: 1800 })) });
  const { call } = await callElder(e, "consent");
  return c.json({ ok: true, mode: call.mode, callId: call.callId });
});
api.get("/elders", async (c) => c.json((await repo.listEldersByFamily(DEMO.familyId)).map((e) => ({ elderId: e.elderId, name: e.name, preferredName: e.preferredName, status: e.status, city: e.city }))));

// ---------- live events ----------
api.get("/live/events", (c) => {
  const since = Number(c.req.query("since") ?? 0) || 0;
  return c.json({ last: lastEventId(), events: eventsSince(since, DEMO.familyId) });
});
api.get("/live/stream", (c) =>
  streamSSE(c, async (stream) => {
    const since = Number(c.req.query("since") ?? 0) || 0;
    for (const ev of eventsSince(since, DEMO.familyId)) await stream.writeSSE({ id: String(ev.id), event: ev.type, data: JSON.stringify(ev) });
    const onEvent = (ev: LiveEvent) => { if (ev.familyId === DEMO.familyId) void stream.writeSSE({ id: String(ev.id), event: ev.type, data: JSON.stringify(ev) }); };
    bus.on("event", onEvent);
    stream.onAbort(() => { bus.off("event", onEvent); });
    while (!stream.aborted) { await stream.sleep(15000); await stream.writeSSE({ event: "ping", data: "{}" }); }
  }),
);

// ---------- demo controls ----------
const demo = new Hono();
demo.use("*", async (c, next) => (env.DEMO_MODE ? next() : c.json({ error: "demo mode off" }, 403)));
demo.post("/seed", async (c) => {
  const b = z.object({ inLaws: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
  await seedDemo({ resetEvents: true, inLaws: b.inLaws });
  return c.json({ ok: true, inLaws: Boolean(b.inLaws) });
});
demo.post("/play-call", async (c) => {
  const b = z.object({ scam: z.boolean().default(true), emergency: z.boolean().default(false), pauseMs: z.number().int().min(200).max(6000).optional(), elderId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const e = await elderOr404(b.elderId ?? DEMO.elderId);
  return c.json({ ok: true, ...(await playDemoCall(e, b)) });
});
demo.post("/simulate-scam-alert", async (c) => {
  const e = await elderOr404(DEMO.elderId);
  const alert = await createAlert({ elder: e, severity: "urgent", type: "scam", title: "Scam attempt blocked", body: `${e.preferredName} told KaiseHo a "CBI officer" asked her to stay on a video call about her Aadhaar.`, data: { pattern: "digital_arrest", score: 0.95, simulated: true }, telegramLines: ["✅ She has NOT sent money. KaiseHo told her it's a scam and to hang up.", "👉 Please call her today. Cyber helpline: 1930"] });
  return c.json({ ok: true, alert });
});
demo.post("/simulate-emergency", async (c) => {
  const e = await elderOr404(DEMO.elderId);
  const r = await raiseEmergency(e, "chest_pain", "My chest is paining and I feel dizzy (simulated)");
  return c.json({ ok: true, alerted: r.alerted });
});
demo.post("/simulate-no-answer", async (c) => {
  const e = await elderOr404(DEMO.elderId);
  for (const attempt of [1, 2]) {
    const call = { elderId: e.elderId, callId: newId("call_noans"), reason: "daily", status: "ringing" as const, attempt, startedAt: nowIso(), familyMessagesSent: 0, mode: "simulated" as const };
    await repo.putCall(call);
    emit("call.ringing", e.familyId, { callId: call.callId, reason: "daily", mode: "simulated", attempt }, e.elderId);
    if (attempt === 1) {
      call.status = "no_answer" as never;
      await repo.putCall({ ...call, status: "no_answer", endedAt: nowIso() });
      emit("call.ended", e.familyId, { callId: call.callId, status: "no_answer", attempt }, e.elderId);
    } else {
      await onNoAnswer(e, call);
    }
  }
  return c.json({ ok: true });
});
demo.post("/digest", async (c) => c.json({ ok: true, digest: await buildDigest(await elderOr404(DEMO.elderId)) }));
demo.post("/nudge", async (c) => c.json({ ok: true, nudge: await computeNudge(await elderOr404(DEMO.elderId)) }));
demo.post("/purge-transcripts", async (c) => c.json({ ok: true, purged: await purgeTranscripts() }));
api.route("/demo", demo);
