import { z } from "zod";
import { Slot } from "@kaiseho/shared";
import { ToolRejected, type ToolSpec } from "../../../control/tiers";
import { redactPII } from "../../../control/redact";
import { emit } from "../../../engine/events";
import { localDate, newId, nowIso } from "../../../engine/ids";
import { getRepo } from "../../../repo";
import { ackAlert } from "../alerts";
import { callElder } from "../calls";
import { storedToday, timeline, trends, weeklySummary } from "../family";
import { conversationStarters, familyCallStats } from "../nudges";
import { todayView } from "../views";
import { doctorBrief, drillScore, refills } from "../health";

/**
 * /mcp/family tools (plan.md Section 10.2): the child's door, used from Claude or any MCP client.
 * Scoped to the caller's family by the server (runTool checks familyId).
 */
export interface FamilyTool<S extends z.ZodRawShape> {
  description: string;
  shape: S;
  spec: ToolSpec<z.infer<z.ZodObject<S>>>;
}
const elder_id = z.string().optional().describe("Elder id from list_elders; defaults to the family's first elder");

const t = <S extends z.ZodRawShape>(x: FamilyTool<S>) => x;

export const FAMILY_TOOLS = {
  list_elders: t({
    description: "List the parents KaiseHo checks on, with today's status.",
    shape: { elder_id },
    spec: {
      name: "list_elders", tier: "T0", label: () => "👀 Family listed elders",
      run: async (_a, { elder }) => {
        const elders = await getRepo().listEldersByFamily(elder.familyId);
        return { elders: await Promise.all(elders.map(async (e) => { const v = await todayView(e); return { elder_id: e.elderId, name: `${e.name} (${e.preferredName})`, city: e.city, status: e.status, next_call: e.callTimeLocal, mood_today: v.wellbeing?.mood ?? null }; })) };
      },
    },
  }),
  get_status: t({
    description: "Today's status: was she called, medicines per slot, mood, sleep, pain, open alerts, next call.",
    shape: { elder_id },
    spec: {
      name: "get_status", tier: "T0", label: () => "👀 Family checked today's status",
      run: async (_a, { elder }) => {
        const v = await todayView(elder);
        const call = (await getRepo().listCalls(elder.elderId)).find((c) => c.startedAt && localDate(elder.tz, new Date(c.startedAt)) === v.date);
        const open = (await getRepo().listAlerts(elder.familyId)).filter((a) => a.elderId === elder.elderId && a.status === "open" && a.severity !== "info");
        return { date: v.date, called_today: Boolean(call), last_call: call?.summary?.family_en ?? call?.status ?? null, meds: v.meds.map((m) => `${m.name} ${m.slot}: ${m.status}`), wellbeing: v.wellbeing, open_alerts: open.map((a) => a.title), next_call: `${elder.callTimeLocal} (${elder.status})` };
      },
    },
  }),
  get_weekly_summary: t({
    description: "How was she this week? Narrative + key numbers (adherence, mood trend, pain, alerts, family calls).",
    shape: { elder_id, days: z.number().int().min(3).max(30).optional() },
    spec: { name: "get_weekly_summary", tier: "T0", label: () => "📊 Family read the weekly summary", run: async (a, { elder }) => weeklySummary(elder, a.days ?? 7) },
  }),
  get_trends: t({
    description: "Daily series for one metric with a one-line interpretation.",
    shape: { elder_id, metric: z.enum(["mood", "sleep", "pain", "adherence"]), days: z.number().int().min(3).max(30).optional() },
    spec: {
      name: "get_trends", tier: "T0", label: (a) => `📈 Family read ${a.metric} trend`,
      run: async (a, { elder }) => {
        const s = await trends(elder, a.days ?? 14);
        const vals = s.map((x) => ({ date: x.date, value: x[a.metric] }));
        const v = vals.map((x) => x.value).filter((x): x is number => x !== null);
        const half = Math.floor(v.length / 2);
        const first = v.slice(0, half), second = v.slice(half);
        const m = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0);
        const dir = m(second) - m(first);
        return { series: vals, interpretation: v.length < 2 ? "Not enough data yet." : `${a.metric} is ${Math.abs(dir) < 0.3 ? "steady" : dir > 0 ? "rising" : "falling"} (${m(first).toFixed(1)} → ${m(second).toFixed(1)}).` };
      },
    },
  }),
  get_alerts: t({
    description: "List alerts (open by default).",
    shape: { elder_id, status: z.enum(["open", "all"]).optional() },
    spec: {
      name: "get_alerts", tier: "T0", label: () => "🔔 Family read alerts",
      run: async (a, { elder }) => {
        const all = (await getRepo().listAlerts(elder.familyId)).filter((x) => x.severity !== "info");
        const list = (a.status === "all" ? all : all.filter((x) => x.status === "open")).slice(0, 10);
        return { alerts: list.map((x) => ({ alert_id: x.alertId, severity: x.severity, title: x.title, body: x.body.slice(0, 160), status: x.status, at: x.createdAt })) };
      },
    },
  }),
  acknowledge_alert: t({
    description: "Acknowledge an alert (you are handling it).",
    shape: { elder_id, alert_id: z.string(), note: z.string().max(200).optional() },
    spec: {
      name: "acknowledge_alert", tier: "T2", label: (a) => `✅ Alert ${a.alert_id} acknowledged via MCP`,
      run: async (a, { elder, actor }) => {
        const al = await getRepo().getAlert(a.alert_id);
        if (!al || al.familyId !== elder.familyId) throw new ToolRejected("unknown alert");
        await ackAlert(a.alert_id, actor);
        return { ok: true };
      },
    },
  }),
  get_conversation_starters: t({
    description: "3 specific things to talk about with her tonight, each with why.",
    shape: { elder_id },
    spec: { name: "get_conversation_starters", tier: "T0", label: () => "💡 Family got conversation starters", run: async (_a, { elder }) => ({ starters: await conversationStarters(elder), family_calls: await familyCallStats(elder) }) },
  }),
  get_audit_log: t({
    description: "What KaiseHo did (every tool call, risk tier, actor), most recent first.",
    shape: { elder_id, limit: z.number().int().min(1).max(50).optional() },
    spec: {
      name: "get_audit_log", tier: "T0", label: () => "🧾 Family read the audit log",
      run: async (a, { elder }) => ({ entries: (await getRepo().listAudit(elder.elderId)).slice(0, a.limit ?? 15).map((x) => `${x.ts.slice(5, 16).replace("T", " ")} ${x.tier} ${x.actor} ${x.tool}: ${x.resultSummary}`), stored_today: await storedToday(elder) }),
    },
  }),
  get_doctor_brief: t({
    description: "A one-page summary for her next doctor visit: medicine adherence, mood, pain timeline, changes, events and questions to ask (last N days).",
    shape: { elder_id, days: z.number().int().min(7).max(90).optional() },
    spec: { name: "get_doctor_brief", tier: "T0", label: () => "🩺 Family read the doctor brief", run: async (a, { elder }) => doctorBrief(elder, a.days ?? 30) },
  }),
  get_refills: t({
    description: "Medicine stock: days left for each medicine and when it runs out.",
    shape: { elder_id },
    spec: { name: "get_refills", tier: "T0", label: () => "💊 Family checked refills", run: async (_a, { elder }) => ({ refills: await refills(elder), scam_drills: await drillScore(elder) }) },
  }),
  get_call_history: t({
    description: "Recent check-in calls with their summaries.",
    shape: { elder_id, days: z.number().int().min(1).max(30).optional() },
    spec: { name: "get_call_history", tier: "T0", label: () => "📞 Family read call history", run: async (a, { elder }) => ({ calls: (await timeline(elder, a.days ?? 7)).slice(0, 8).map((c) => ({ at: c.startedAt, status: c.status, summary: c.summary?.family_en ?? null })) }) },
  }),
  add_medication: t({
    description: "Add a medicine to her schedule; KaiseHo asks about it from the next call.",
    shape: { elder_id, name: z.string().min(2).max(60), dose: z.string().min(1).max(30), slots: z.array(Slot).min(1), with_food: z.enum(["before", "after", "any"]).optional(), stock_count: z.number().int().min(0).max(1000).optional() },
    spec: {
      name: "add_medication", tier: "T2", label: (a, _r) => `💊 Medication added: ${a.name} ${a.dose} (${a.slots.join(", ")})`,
      run: async (a, { elder, actor }) => {
        const med = { elderId: elder.elderId, medId: newId("med"), name: a.name, dose: a.dose, slots: a.slots, withFood: a.with_food, startDate: localDate(elder.tz), stockCount: a.stock_count, refillThresholdDays: 3, active: true, addedBy: actor };
        await getRepo().putMedication(med);
        return { ok: true, med_id: med.medId, note: `KaiseHo will ask about ${a.name} from the next call at ${elder.callTimeLocal}.` };
      },
    },
  }),
  update_medication: t({
    description: "Change a medicine's dose, times or stock.",
    shape: { elder_id, med_id: z.string(), dose: z.string().optional(), slots: z.array(Slot).optional(), stock_count: z.number().int().optional() },
    spec: {
      name: "update_medication", tier: "T2", label: (a) => `💊 Medication ${a.med_id} updated`,
      run: async (a, { elder }) => {
        const med = (await getRepo().listMedications(elder.elderId)).find((m) => m.medId === a.med_id);
        if (!med) throw new ToolRejected("unknown medicine");
        if (a.dose) med.dose = a.dose;
        if (a.slots) med.slots = a.slots;
        if (a.stock_count !== undefined) med.stockCount = a.stock_count;
        await getRepo().putMedication(med);
        return { ok: true };
      },
    },
  }),
  remove_medication: t({
    description: "Stop asking about a medicine (doctor stopped it).",
    shape: { elder_id, med_id: z.string() },
    spec: {
      name: "remove_medication", tier: "T2", label: (a) => `💊 Medication ${a.med_id} removed`,
      run: async (a, { elder }) => {
        const med = (await getRepo().listMedications(elder.elderId)).find((m) => m.medId === a.med_id);
        if (!med) throw new ToolRejected("unknown medicine");
        med.active = false; med.endDate = localDate(elder.tz);
        await getRepo().putMedication(med);
        return { ok: true };
      },
    },
  }),
  leave_message_for_elder: t({
    description: "Leave a message; KaiseHo delivers it naturally in the next call and tells you when she heard it.",
    shape: { elder_id, text: z.string().min(1).max(300), from_name: z.string().min(1).max(40) },
    spec: {
      name: "leave_message_for_elder", tier: "T2", label: (a) => `✉️ ${a.from_name} left a message: "${a.text.slice(0, 50)}"`,
      run: async (a, { elder }) => {
        const msg = { elderId: elder.elderId, messageId: newId("msg"), direction: "to_elder" as const, fromName: a.from_name, text: redactPII(a.text), delivered: false, createdAt: nowIso() };
        await getRepo().putMessage(msg);
        emit("message.queued", elder.familyId, { message: msg }, elder.elderId);
        return { ok: true, note: `Will be delivered in the next call at ${elder.callTimeLocal}.` };
      },
    },
  }),
  call_now: t({
    description: "Ask KaiseHo to call her right now (max 3 a day).",
    shape: { elder_id, reason: z.enum(["checkin", "message"]).optional() },
    spec: {
      name: "call_now", tier: "T2", label: (_a, r) => `📞 KaiseHo calling now (${r.mode})`,
      run: async (a, { elder }) => {
        const { call } = await callElder(elder, a.reason ?? "checkin");
        return { ok: true, call_id: call.callId, mode: call.mode };
      },
    },
  }),
  set_call_schedule: t({
    description: "Change the daily call time (and optionally days). The elder can also change it by voice.",
    shape: { elder_id, time_local: z.string().regex(/^\d{2}:\d{2}$/), days: z.array(z.number().int().min(0).max(6)).optional() },
    spec: {
      name: "set_call_schedule", tier: "T2", label: (a) => `🗓️ Daily call moved to ${a.time_local}`,
      run: async (a, { elder }) => {
        elder.callTimeLocal = a.time_local;
        if (a.days) elder.callDays = a.days;
        await getRepo().putElder(elder);
        emit("schedule.updated", elder.familyId, { callTimeLocal: elder.callTimeLocal, by: "family" }, elder.elderId);
        return { ok: true };
      },
    },
  }),
};
