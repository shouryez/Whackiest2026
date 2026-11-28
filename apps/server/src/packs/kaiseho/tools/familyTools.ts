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
import { requestAppointment } from "../clinic";
import { cancelReminder, createReminder, localToUtc, upcomingReminders } from "../reminders";
import { addOccasion, upcomingOccasions } from "../occasions";
import { lifeCertStatus, logLifeCert } from "../pension";
import { sharedReadback } from "../transparency";
import { wellbeingReport } from "../wellbeing";
import { insightCards } from "../aiInsights";
import { logVital, vitalsSummary } from "../vitals";
import { addNeeds, claimNeed, completeNeed, gasStatus } from "../needs";
import { callRota, memberName } from "../rota";
import { cardUrl, ensureCardToken } from "../card";
import { askStory, storyBook } from "../stories";
import { mindSummary } from "../mindgym";

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
  book_appointment: t({
    description: "Ask KaiseHo to call her clinic and book a follow-up (e.g. 'Thursday morning'). The clinic is told only her name and 'follow-up visit'; she hears the slot in her next call.",
    shape: { elder_id, preferred: z.string().min(2).max(80), note: z.string().max(120).optional() },
    spec: {
      name: "book_appointment", tier: "T2", label: (a) => `🏥 Family asked to book ${a.preferred}`,
      run: async (a, { elder, actor }) => {
        const appt = await requestAppointment(elder, { preferred: a.preferred, reason: a.note, requestedBy: actor });
        return { ok: true, appointment_id: appt.appointmentId, note: `Calling ${appt.clinicName} now; you'll get the confirmed time here and on Telegram.` };
      },
    },
  }),
  get_appointments: t({
    description: "Doctor appointments KaiseHo has booked or is booking.",
    shape: { elder_id },
    spec: { name: "get_appointments", tier: "T0", label: () => "🏥 Family checked appointments", run: async (_a, { elder }) => ({ appointments: (await getRepo().listAppointments(elder.elderId)).slice(0, 6).map((x) => ({ id: x.appointmentId, clinic: x.clinicName, doctor: x.doctor, status: x.status, slot: x.slotSpoken ?? x.preferred })) }) },
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
  get_reminders: t({
    description: "Upcoming reminder and callback calls (set by her in a call, or by family).",
    shape: { elder_id },
    spec: { name: "get_reminders", tier: "T0", label: () => "⏰ Family checked reminders", run: async (_a, { elder }) => ({ reminders: (await upcomingReminders(elder)).map((r) => ({ id: r.reminderId, kind: r.kind, text: r.text, when: r.whenSpoken, set_by: r.createdBy ?? "elder" })) }) },
  }),
  set_reminder_for_elder: t({
    description: "Schedule a short reminder call for her, e.g. 'remind Amma at 6 PM to check her BP'. when_local_iso is her local time (YYYY-MM-DDTHH:MM).",
    shape: { elder_id, text: z.string().min(2).max(200), when_local_iso: z.string() },
    spec: {
      name: "set_reminder_for_elder", tier: "T2", label: (a, r) => `⏰ Family set a reminder ${r.when}: "${a.text.slice(0, 50)}"`,
      run: async (a, { elder, actor }) => {
        const r = await createReminder(elder, { kind: "reminder", text: a.text, when: localToUtc(a.when_local_iso, elder.tz), createdBy: actor });
        return { ok: true, reminder_id: r.reminderId, when: r.whenSpoken };
      },
    },
  }),
  cancel_reminder: t({
    description: "Cancel an upcoming reminder or callback call (id from get_reminders).",
    shape: { elder_id, reminder_id: z.string() },
    spec: { name: "cancel_reminder", tier: "T2", label: (a) => `⏰ Reminder ${a.reminder_id} cancelled`, run: async (a, { elder, actor }) => ({ ok: true, status: (await cancelReminder(elder, a.reminder_id, actor)).status }) },
  }),
  get_occasions: t({
    description: "Upcoming birthdays, anniversaries and festivals in the next N days (KaiseHo greets her and offers to send wishes).",
    shape: { elder_id, days: z.number().int().min(1).max(366).optional() },
    spec: { name: "get_occasions", tier: "T0", label: () => "🎂 Family checked occasions", run: async (a, { elder }) => ({ occasions: (await upcomingOccasions(elder, a.days ?? 30)).map((o) => ({ title: o.title, date: o.date, in_days: o.daysAway, kind: o.kind, source: o.source })) }) },
  }),
  add_occasion: t({
    description: "Add a birthday/anniversary so KaiseHo mentions it and offers to relay her wishes. date: MM-DD (every year) or YYYY-MM-DD (once). Set is_elders=true for her own birthday.",
    shape: { elder_id, title: z.string().min(2).max(80), date: z.string(), kind: z.enum(["birthday", "anniversary", "festival", "other"]), person: z.string().max(40).optional(), relation: z.string().max(30).optional(), is_elders: z.boolean().optional() },
    spec: {
      name: "add_occasion", tier: "T1", label: (a) => `🎂 Occasion added: ${a.title} (${a.date})`,
      run: async (a, { elder, actor }) => {
        const o = await addOccasion(elder.familyId, { elderId: elder.elderId, title: a.title, kind: a.kind, date: a.date, person: a.person, relation: a.relation, isElders: a.is_elders, createdBy: actor });
        return { ok: true, occasion_id: o.occasionId };
      },
    },
  }),
  get_pension_status: t({
    description: "Her yearly pension life certificate (Jeevan Pramaan): due date, status and a checklist.",
    shape: { elder_id },
    spec: { name: "get_pension_status", tier: "T0", label: () => "🪪 Family checked the life certificate", run: async (_a, { elder }) => { const s = lifeCertStatus(elder); return { pensioner: s.applicable, status: s.status, due: s.window.end, days_left: s.window.daysLeft, window_open: s.window.open, checklist: s.checklist }; } },
  }),
  mark_life_certificate: t({
    description: "Record that her life certificate is done (or still pending / needs help) after the family helped.",
    shape: { elder_id, status: z.enum(["done", "not_yet", "needs_help"]), method: z.string().max(60).optional() },
    spec: { name: "mark_life_certificate", tier: "T1", label: (a) => `🪪 Life certificate marked: ${a.status}`, run: async (a, { elder, actor }) => ({ ok: true, pension: await logLifeCert(elder, a.status, actor, a.method) }) },
  }),
  get_what_she_hears: t({
    description: "Transparency: exactly what KaiseHo reads back when she asks 'what did you tell Ravi?' (last summary, alerts, her messages, what stayed private).",
    shape: { elder_id },
    spec: { name: "get_what_she_hears", tier: "T0", label: () => "🪟 Family viewed the read-back", run: async (_a, { elder }) => sharedReadback(elder) },
  }),
  get_wellbeing: t({
    description: "Her Wellbeing Index (0-100) vs her own usual, six dimensions (mood, sleep, appetite, people, activity, comfort) this week vs last, patterns found in her history, and AI suggestions for the family.",
    shape: { elder_id },
    spec: {
      name: "get_wellbeing", tier: "T0", label: () => "📈 Family read the wellbeing report",
      run: async (_a, { elder }) => {
        const r = await wellbeingReport(elder);
        const ai = await insightCards(elder);
        return { today: r.today, usual: r.baseline.mean, status: r.status, dims: r.dims, patterns: r.patterns.map((p) => `${p.title}: ${p.detail}`), good_moments: r.highlights, suggestions: ai.cards };
      },
    },
  }),
  get_vitals: t({
    description: "Home readings she reported (sugar, BP, oxygen, weight) over N days: latest, average, range and how often out of her target range.",
    shape: { elder_id, days: z.number().int().min(7).max(90).optional() },
    spec: { name: "get_vitals", tier: "T0", label: () => "🩸 Family checked readings", run: async (a, { elder }) => { const v = await vitalsSummary(elder, a.days ?? 30); return { targets: v.targets, readings: v.kinds.map(({ series, ...k }) => ({ ...k, last5: series.slice(-5) })) }; } },
  }),
  log_vital_for_elder: t({
    description: "Record a reading on her behalf (e.g. from the clinic or a home visit).",
    shape: { elder_id, kind: z.enum(["sugar", "bp", "weight", "spo2", "temperature"]), value: z.number(), value2: z.number().optional(), context: z.enum(["fasting", "after_food", "random", "morning", "evening"]).optional() },
    spec: { name: "log_vital_for_elder", tier: "T1", label: (_a, r) => `🩸 Family logged ${r.reading}`, run: async (a, { elder }) => logVital(elder, { kind: a.kind, value: a.value, value2: a.value2, context: a.context, source: "family" }) },
  }),
  get_needs: t({
    description: "Her household needs list (groceries, medicines, gas cylinder, repairs): what's open, who's handling what, and when the gas is due.",
    shape: { elder_id },
    spec: { name: "get_needs", tier: "T0", label: () => "🛒 Family checked the needs list", run: async (_a, { elder }) => ({ needs: (await getRepo().listNeeds(elder.elderId)).slice(0, 15).map((n) => ({ id: n.needId, item: n.item, category: n.category, status: n.status, by: n.claimedBy ?? null })), gas: gasStatus(elder) }) },
  }),
  handle_need: t({
    description: "Claim an item ('I'll handle it') or mark it done. KaiseHo tells her who arranged it in the next call.",
    shape: { elder_id, need_id: z.string(), action: z.enum(["claim", "done"]) },
    spec: {
      name: "handle_need", tier: "T1", label: (a, r) => `🛒 ${r.by} ${a.action === "done" ? "got" : "is arranging"}: ${r.item}`,
      run: async (a, { elder, actor }) => {
        const by = await memberName(elder.familyId, actor);
        const n = a.action === "done" ? await completeNeed(elder, a.need_id, by) : await claimNeed(elder, a.need_id, by);
        return { ok: true, item: n.item, status: n.status, by };
      },
    },
  }),
  add_need_for_elder: t({
    description: "Add something to her needs list yourself (e.g. 'book her gas cylinder', 'fix the geyser').",
    shape: { elder_id, item: z.string().min(2).max(60) },
    spec: { name: "add_need_for_elder", tier: "T1", label: (a) => `🛒 Added: ${a.item}`, run: async (a, { elder }) => addNeeds(elder, [{ item: a.item }], "family") },
  }),
  get_call_rota: t({
    description: "Who in the family called her this week and when, and whose turn it is next.",
    shape: { elder_id },
    spec: { name: "get_call_rota", tier: "T0", label: () => "📅 Family checked the call rota", run: async (_a, { elder }) => callRota(elder) },
  }),
  get_health_card: t({
    description: "Link to her emergency health card (QR for neighbours / paramedics): conditions, medicines, allergies, contacts.",
    shape: { elder_id },
    spec: { name: "get_health_card", tier: "T0", label: () => "🆘 Family opened the health card", run: async (_a, { elder }) => { await ensureCardToken(elder); return { url: cardUrl(elder), note: "Print the QR from the dashboard and stick it on her fridge." }; } },
  }),
  get_life_stories: t({
    description: "Her story book: life stories she told KaiseHo (childhood, wedding, raising the family, recipes, advice), only if she chose to share memories. Also the questions waiting to be asked.",
    shape: { elder_id },
    spec: { name: "get_life_stories", tier: "T0", maxResultChars: 6000, label: () => "📖 Family read her story book", run: async (_a, { elder }) => storyBook(elder) },
  }),
  request_story: t({
    description: "Ask her for a story: KaiseHo asks your question warmly in her next call and the story arrives in her book and on Telegram. E.g. 'How did you and Appa meet?'",
    shape: { elder_id, question: z.string().min(8).max(200) },
    spec: {
      name: "request_story", tier: "T1", label: (a) => `📖 Story question for her next call: "${a.question}"`,
      run: async (a, { elder, actor }) => { const ask = await askStory(elder, a.question, await memberName(elder.familyId, actor)); return { ok: true, ask_id: ask.askId, note: "She'll be asked in her next regular check-in." }; },
    },
  }),
  get_mind_gym: t({
    description: "Her playful memory-game results (three-word recall, naming games) and the trend vs her own usual. Not a medical test; a sustained dip is worth mentioning to her doctor.",
    shape: { elder_id },
    spec: { name: "get_mind_gym", tier: "T0", label: () => "🧩 Family checked the mind gym", run: async (_a, { elder }) => mindSummary(elder) },
  }),
  set_call_style: t({
    description: "How KaiseHo sounds to her: 'clear' (short, to the point, assistant-like) or 'warm' (chatty companion). Her own preference wins if she says so in a call.",
    shape: { elder_id, style: z.enum(["clear", "warm"]) },
    spec: {
      name: "set_call_style", tier: "T1", label: (a) => `🎙️ Call style: ${a.style}`,
      run: async (a, { elder }) => { elder.voiceStyle = a.style; await getRepo().putElder(elder); return { ok: true, style: a.style }; },
    },
  }),
};
