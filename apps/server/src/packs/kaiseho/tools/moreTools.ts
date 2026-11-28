import { z } from "zod";
import { HELPLINES } from "@kaiseho/shared";
import { ToolRejected } from "../../../control/tiers";
import { redactPII } from "../../../control/redact";
import { emit } from "../../../engine/events";
import { newId, nowIso } from "../../../engine/ids";
import { escapeHtml, sendTelegram } from "../../../engine/notify/telegram";
import { env } from "../../../env";
import { getRepo } from "../../../repo";
import { createAlert } from "../alerts";
import { buildContext } from "../context";
import { raiseEmergency } from "../emergency";
import { DRILLS } from "../health";
import { requestAppointment } from "../clinic";
import { createReminder, localToUtc } from "../reminders";
import { keepPrivate, sharedReadback } from "../transparency";
import { logLifeCert } from "../pension";
import { relayWish } from "../occasions";
import { logVital } from "../vitals";
import { addNeeds } from "../needs";
import { saveStory } from "../stories";
import { logGame } from "../mindgym";
import { ensureCall, type AgentTool } from "./agentTools";

/** Phase 1 agent tools (plan.md Section 10.1). */
const elder_id = z.string().describe("The elder_id from your instructions. Never say it aloud.");
const call_id = z.string().describe("The call_id from your instructions.");

// Time helpers live in ../reminders (shared with the family's reminder tools).
export { localToUtc };

// ---------------- get_today_context (T0) ----------------
const getTodayShape = { elder_id };
export const get_today_context: AgentTool<typeof getTodayShape> = {
  description: "Fetch fresh context (medicines due, follow-ups, undelivered family messages) if your instructions seem stale. Rarely needed.",
  shape: getTodayShape,
  spec: {
    name: "get_today_context", tier: "T0",
    label: () => "📋 Fetched today's context",
    run: async (_a, { elder }) => {
      const v = await buildContext(elder, "daily", "ctx");
      return { meds_today: v.meds_today, follow_ups: v.follow_ups, family_messages: JSON.parse(v.family_messages) };
    },
  },
};

// ---------------- recall_memory (T0) ----------------
const recallShape = { elder_id, query: z.string().min(2).max(100).describe("What to look up, e.g. 'knee' or 'Kamala'") };
export const recall_memory: AgentTool<typeof recallShape> = {
  description: "Look up what the elder told you before about a person, event or health topic. Returns up to 3 short memories.",
  shape: recallShape,
  spec: {
    name: "recall_memory", tier: "T0",
    label: (a, r) => `🧠 Recalled "${a.query}" (${(r.memories as unknown[]).length} found)`,
    run: async (a, { elder }) => {
      const words = a.query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const mems = (await getRepo().listMemories(elder.elderId))
        .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length + m.importance / 10 }))
        .filter((x) => x.score >= 1)
        .sort((x, y) => y.score - x.score)
        .slice(0, 3);
      return { memories: mems.map(({ m }) => `${m.text}${m.private ? " (private: don't share with family)" : ""} [${m.createdAt.slice(0, 10)}]`) };
    },
  },
};

// ---------------- mark_message_delivered (T1) ----------------
const deliveredShape = { elder_id, message_id: z.string().describe("The id from family_messages") };
export const mark_message_delivered: AgentTool<typeof deliveredShape> = {
  description: "After you have told the elder a family message, mark it delivered (the family gets a 'heard your message' receipt).",
  shape: deliveredShape,
  spec: {
    name: "mark_message_delivered", tier: "T1",
    label: (_a, r) => `✉️ Delivered ${r.from}'s message: "${r.text}"`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      const msg = await repo.getMessage(elder.elderId, a.message_id);
      if (!msg || msg.direction !== "to_elder") throw new ToolRejected("unknown message", "continue the conversation");
      msg.delivered = true;
      msg.deliveredAt = nowIso();
      await repo.putMessage(msg);
      const sender = (await repo.listMembers(elder.familyId)).find((m) => m.name === msg.fromName);
      const chatId = sender?.telegramChatId ?? (sender?.role === "primary" ? env.TELEGRAM_DEMO_CHAT_ID : undefined);
      if (chatId) void sendTelegram(chatId, `✅ ${escapeHtml(elder.preferredName)} heard your message: "${escapeHtml(msg.text)}" ❤️`);
      return { ok: true, from: msg.fromName, text: msg.text.slice(0, 60) };
    },
  },
};

// ---------------- set_reminder (T2) ----------------
const reminderShape = {
  elder_id,
  text: z.string().min(2).max(200).describe("What to remind her about, e.g. 'call the plumber'"),
  when_local_iso: z.string().describe("Local date-time in her timezone, e.g. 2026-12-01T18:00"),
};
export const set_reminder: AgentTool<typeof reminderShape> = {
  description: "Set a short reminder call (e.g. 'remind me at 6 to call the plumber'). KaiseHo will call her at that time.",
  shape: reminderShape,
  spec: {
    name: "set_reminder", tier: "T2",
    label: (a, r) => `⏰ Reminder set ${r.when_spoken}: "${a.text}"`,
    run: async (a, { elder }) => {
      const r = await createReminder(elder, { kind: "reminder", text: a.text, when: localToUtc(a.when_local_iso, elder.tz), createdBy: "elder" });
      return { ok: true, when_spoken: r.whenSpoken };
    },
  },
};

// ---------------- request_callback (T2) ----------------
const callbackShape = {
  elder_id,
  in_minutes: z.number().int().min(5).max(24 * 60).optional(),
  at_local_iso: z.string().optional(),
};
export const request_callback: AgentTool<typeof callbackShape> = {
  description: "The elder is busy or tired: schedule KaiseHo to call back later (in N minutes or at a local time).",
  shape: callbackShape,
  spec: {
    name: "request_callback", tier: "T2",
    label: (_a, r) => `🔁 Callback scheduled ${r.when_spoken}`,
    run: async (a, { elder }) => {
      const when = a.at_local_iso ? localToUtc(a.at_local_iso, elder.tz) : new Date(Date.now() + (a.in_minutes ?? 60) * 60_000);
      const r = await createReminder(elder, { kind: "callback", text: "callback", when, createdBy: "elder" });
      return { ok: true, when_spoken: r.whenSpoken };
    },
  },
};

// ---------------- update_call_preferences (T2) ----------------
const prefsShape = {
  elder_id,
  action: z.enum(["skip_next", "pause_until", "change_time", "stop", "resume", "style_clear", "style_warm"]).describe("style_clear: she wants shorter, to-the-point calls; style_warm: she enjoys long chatty calls"),
  until_date: z.string().optional().describe("YYYY-MM-DD for pause_until"),
  new_time_local: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM for change_time"),
  reason: z.string().max(200).optional(),
};
export const update_call_preferences: AgentTool<typeof prefsShape> = {
  description: "The elder controls the calls: 'don't call tomorrow', 'call me at 10 instead', 'stop calling me', 'start again'. Always honour it and confirm.",
  shape: prefsShape,
  spec: {
    name: "update_call_preferences", tier: "T2",
    label: (_a, r) => `🗓️ Schedule: ${r.spoken_confirmation}`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      let said = "";
      const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      switch (a.action) {
        case "skip_next": elder.status = "paused"; elder.pausedUntil = a.until_date ?? tomorrow; said = `I won't call tomorrow. I'll call again after that.`; break;
        case "pause_until":
          if (!a.until_date) throw new ToolRejected("missing date", "ask until which day to pause");
          elder.status = "paused"; elder.pausedUntil = a.until_date; said = `Paused until ${a.until_date}.`; break;
        case "change_time":
          if (!a.new_time_local) throw new ToolRejected("missing time", "ask what time suits her");
          elder.callTimeLocal = a.new_time_local; said = `From now on I'll call at ${a.new_time_local}.`; break;
        case "stop": elder.status = "stopped"; elder.pausedUntil = undefined; said = "I've stopped the daily calls. Your family will be told. Just say yes when you want them again."; break;
        case "resume": elder.status = "active"; elder.pausedUntil = undefined; said = "Daily calls are back on."; break;
        case "style_clear": elder.voiceStyle = "clear"; said = "From now on I'll keep our calls short and to the point."; break;
        case "style_warm": elder.voiceStyle = "warm"; said = "Lovely, we'll take our time and chat more."; break;
      }
      await repo.putElder(elder);
      emit("schedule.updated", elder.familyId, { status: elder.status, pausedUntil: elder.pausedUntil, callTimeLocal: elder.callTimeLocal, by: "elder" }, elder.elderId);
      await createAlert({
        elder, severity: "info", type: "pause",
        title: `${elder.preferredName} changed her calls`,
        body: `${said}${a.reason ? ` Reason: ${redactPII(a.reason)}` : ""}`,
        data: { action: a.action },
      });
      return { ok: true, spoken_confirmation: said };
    },
  },
};

// ---------------- record_consent (T2) ----------------
const consentShape = {
  elder_id, call_id,
  daily_calls: z.boolean(),
  preferred_time_local: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  share_medicines: z.boolean(),
  share_wellbeing: z.boolean(),
  share_memories: z.boolean(),
  notes: z.string().max(300).optional(),
};
export const record_consent: AgentTool<typeof consentShape> = {
  description: "Consent call only: record whether the elder agreed to daily calls, the time, and what can be shared with family.",
  shape: consentShape,
  spec: {
    name: "record_consent", tier: "T2",
    label: (a) => `🤝 Consent recorded: daily calls ${a.daily_calls ? "yes" : "no"}${a.preferred_time_local ? ` at ${a.preferred_time_local}` : ""}`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const consent = {
        elderId: elder.elderId, consentId: newId("cns"), callId: a.call_id, dailyCalls: a.daily_calls, preferredTime: a.preferred_time_local,
        shareMedicines: a.share_medicines, shareWellbeing: a.share_wellbeing, shareMemories: a.share_memories,
        notes: a.notes ? redactPII(a.notes) : undefined, recordedAt: nowIso(),
      };
      await repo.putConsent(consent);
      elder.consentId = consent.consentId;
      elder.privacy = { shareMedicines: a.share_medicines, shareWellbeing: a.share_wellbeing, shareMemories: a.share_memories };
      elder.status = a.daily_calls ? "active" : "stopped";
      if (a.preferred_time_local) elder.callTimeLocal = a.preferred_time_local;
      await repo.putElder(elder);
      emit("schedule.updated", elder.familyId, { status: elder.status, callTimeLocal: elder.callTimeLocal, by: "consent" }, elder.elderId);
      return { ok: true };
    },
  },
};

// ---------------- raise_emergency (T3) ----------------
const emergencyShape = {
  elder_id, call_id,
  kind: z.enum(["chest_pain", "breathing", "fall", "confusion", "bleeding", "fainting", "mental_health", "other"]),
  details: z.string().min(2).max(500).describe("What the elder said, in their words"),
};
export const raise_emergency: AgentTool<typeof emergencyShape> = {
  description: "IMMEDIATELY call this for chest pain, trouble breathing, a fall with injury or can't get up, sudden confusion, slurred speech, heavy bleeding, fainting, or if they say they want to die or hurt themselves (kind=mental_health). Alerts all family and the neighbour.",
  shape: emergencyShape,
  spec: {
    name: "raise_emergency", tier: "T3",
    label: (a, r) => `🚑 EMERGENCY (${a.kind.replace("_", " ")}) → alerted ${(r.alerted as string[]).join(", ")}`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      const { alerted } = await raiseEmergency(elder, a.kind, redactPII(a.details), a.call_id);
      const say = a.kind === "mental_health"
        ? `Stay with her warmly. Tell her you've asked ${alerted[0] ?? "her family"} to call her now and that talking to family helps. Do not lecture.`
        : `Tell her to call ${HELPLINES.emergency} now or ask someone nearby, that ${alerted.join(" and ")} are being informed right now, to sit or lie down safely, and that you're staying on the line. Never say an ambulance is coming.`;
      return { ok: true, alerted, say };
    },
  },
};

// ---------------- log_scam_drill (T1) ----------------
const drillShape = {
  elder_id, call_id,
  drill_id: z.string().describe("The id given in scam_drill"),
  passed: z.boolean().describe("true if her answer was safe (hang up / don't share / check with family)"),
  answer: z.string().max(200).optional().describe("Her answer, briefly"),
};
export const log_scam_drill: AgentTool<typeof drillShape> = {
  description: "After asking the weekly scam-safety question (scam_drill), record whether her answer was safe. If not, gently teach the right answer before logging.",
  shape: drillShape,
  spec: {
    name: "log_scam_drill", tier: "T1",
    label: (a) => `🎓 Scam drill (${a.drill_id.replace("_", " ")}): ${a.passed ? "answered safely ✓" : "learned the safe answer"}`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const d = DRILLS.find((x) => x.id === a.drill_id);
      const prev = await repo.getCheckIn(elder.elderId, a.call_id);
      await repo.putCheckIn({
        elderId: elder.elderId, callId: a.call_id, date: prev?.date ?? new Date().toISOString().slice(0, 10), ...prev,
        scamDrill: { id: a.drill_id, question: d?.q ?? a.drill_id, passed: a.passed, answer: a.answer ? redactPII(a.answer) : undefined },
        updatedAt: nowIso(),
      });
      return { ok: true, praise: a.passed };
    },
  },
};

// ---------------- request_appointment (T2) ----------------
const apptShape = {
  elder_id, call_id,
  preferred: z.string().min(2).max(80).describe("When she'd like to go, in her words, e.g. 'Thursday morning'"),
  reason: z.string().max(120).optional().describe("Only for the family's notes; the clinic is told just 'follow-up visit'"),
  elder_consented: z.boolean().describe("true only after she agreed that KaiseHo may call the clinic for her"),
};
export const request_appointment: AgentTool<typeof apptShape> = {
  description: "She asked you to book a doctor's appointment: confirm the day/time she wants and that you may call the clinic for her (elder_consented=true). KaiseHo then calls the clinic and tells her the slot in the next call.",
  shape: apptShape,
  spec: {
    name: "request_appointment", tier: "T2",
    label: (a) => `🏥 Appointment request: ${a.preferred}`,
    run: async (a, { elder }) => {
      const call = await ensureCall(elder.elderId, a.call_id);
      const appt = await requestAppointment(elder, { preferred: a.preferred, reason: a.reason ? redactPII(a.reason) : undefined, requestedBy: "elder", simulated: call.mode === "simulated" });
      return { ok: true, say: `I'll call ${appt.clinicName} for ${appt.preferred} and tell you the time in our next call.` };
    },
  },
};


// ---------------- get_shared_with_family (T0) — P2-13 "What did you tell Ravi?" ----------------
const sharedShape = { elder_id, days: z.number().int().min(1).max(14).optional().describe("How far back, default 3 days") };
export const get_shared_with_family: AgentTool<typeof sharedShape> = {
  description: "She asks what you told her family ('What did you tell Ravi?', 'Ravi ko kya bataya?'). Returns exactly what the family saw; read the 'say' text back to her warmly in her language, without changing facts.",
  shape: sharedShape,
  spec: {
    name: "get_shared_with_family", tier: "T0", maxResultChars: 1400,
    label: (_a, r) => `🪟 Read back what family saw (${(r.alerts as unknown[]).length} alert${(r.alerts as unknown[]).length === 1 ? "" : "s"}, ${r.has_summary ? "1 summary" : "no summary"})`,
    run: async (a, { elder }) => {
      const r = await sharedReadback(elder, a.days ?? 3);
      return { say: r.say, has_summary: Boolean(r.lastSummary), alerts: r.alerts.map((x) => x.title), private_kept: r.privateCount };
    },
  },
};

// ---------------- keep_private (T1) ----------------
const keepPrivateShape = { elder_id, topic: z.string().min(2).max(100).describe("What she doesn't want shared, e.g. 'my knee' or 'the money I lent'") };
export const keep_private: AgentTool<typeof keepPrivateShape> = {
  description: "She says 'don't tell Ravi about X'. Marks it private from now on. Be honest: what was already sent can't be unsent, and scams/emergencies always go to family.",
  shape: keepPrivateShape,
  spec: {
    name: "keep_private", tier: "T1",
    label: (_a, r) => `🔒 Kept private from now on (${r.hidden} memor${r.hidden === 1 ? "y" : "ies"})`,
    run: async (a, { elder }) => {
      const { hidden } = await keepPrivate(elder, redactPII(a.topic));
      await getRepo().putMemory({ elderId: elder.elderId, memoryId: newId("mem"), type: "preference", text: `Asked to keep private: ${redactPII(a.topic)}`, importance: 3, private: true, source: "tool", lastMentionedAt: nowIso(), createdAt: nowIso() });
      return { ok: true, hidden, say: "From now on I won't share that. Anything I already sent stays sent, and scams or emergencies always go to your family." };
    },
  },
};

// ---------------- log_life_certificate (T1) — P2-9 ----------------
const lifeCertShape = {
  elder_id, call_id,
  status: z.enum(["done", "not_yet", "needs_help"]),
  method: z.string().max(60).optional().describe("How she did it, e.g. 'at the bank', 'face app', 'doorstep'"),
};
export const log_life_certificate: AgentTool<typeof lifeCertShape> = {
  description: "After asking about her yearly pension life certificate (pension_note), record the answer. not_yet/needs_help tells the family with a checklist. Never ask for Aadhaar, PPO or bank numbers.",
  shape: lifeCertShape,
  spec: {
    name: "log_life_certificate", tier: "T1",
    label: (a) => `🪪 Life certificate: ${a.status === "done" ? "submitted ✓" : a.status === "needs_help" ? "needs help (family told)" : "not yet (family told)"}`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      await logLifeCert(elder, a.status, "elder", a.method);
      return { ok: true, say: a.status === "done" ? "Praise her." : "Tell her you've let the family know so they can help, and it only takes a few minutes at the bank or on a phone." };
    },
  },
};

// ---------------- relay_wish (T2) — P2-10 ----------------
const wishShape = {
  elder_id, call_id,
  occasion_id: z.string().describe("The id given in occasions, e.g. occ_..."),
  wish: z.string().min(2).max(300).describe("Her wish, in her words"),
  elder_consented: z.boolean().describe("true only after she agreed to send it"),
};
export const relay_wish: AgentTool<typeof wishShape> = {
  description: "She wants to send a birthday/anniversary wish (from occasions). Relays her words to the family, who pass it on.",
  shape: wishShape,
  spec: {
    name: "relay_wish", tier: "T2",
    label: (a, r) => `🎂 Wish for ${r.for}: "${a.wish.slice(0, 50)}"`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      return relayWish(elder, a.occasion_id, a.wish, a.call_id);
    },
  },
};

// ---------------- log_vital (T1): home readings by voice ----------------
const vitalShape = {
  elder_id, call_id,
  kind: z.enum(["sugar", "bp", "weight", "spo2", "temperature"]),
  value: z.number().describe("The number she reads out. For BP this is the top number (systolic)"),
  value2: z.number().optional().describe("BP only: the bottom number (diastolic)"),
  context: z.enum(["fasting", "after_food", "random", "morning", "evening"]).optional().describe("Sugar: fasting (before breakfast) or after_food"),
};
export const log_vital: AgentTool<typeof vitalShape> = {
  description: "She tells you a home reading: 'sugar was 140 this morning', 'BP 150 by 90', 'oxygen 96'. Log it, then follow the 'say' guidance. Never interpret medically or suggest medicines.",
  shape: vitalShape,
  spec: {
    name: "log_vital", tier: "T1",
    label: (_a, r) => `🩸 ${r.reading}${r.status === "normal" ? " ✓" : ` · ${String(r.status).replace("_", " ")}`}`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      return logVital(elder, { kind: a.kind, value: a.value, value2: a.value2, context: a.context, source: "voice", callId: a.call_id });
    },
  },
};

// ---------------- add_need (T1): household needs ----------------
const needShape = {
  elder_id, call_id,
  items: z.array(z.object({
    item: z.string().min(2).max(60).describe("e.g. 'atta', 'gas cylinder', 'BP tablets', 'plumber for the kitchen tap'"),
    category: z.enum(["groceries", "medicine", "gas", "household", "repair", "other"]).optional(),
    urgency: z.enum(["normal", "soon"]).optional(),
  })).min(1).max(8),
};
export const add_need: AgentTool<typeof needShape> = {
  description: "She mentions something running out or needing fixing ('atta is finishing', 'the cylinder is low', 'the tap is leaking'). Adds it to the family's shared list; tell her the family will arrange it.",
  shape: needShape,
  spec: {
    name: "add_need", tier: "T1",
    label: (_a, r) => `🛒 Added to family list: ${(r.added as string[]).join(", ") || "(already there)"}`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      return addNeeds(elder, a.items, "voice");
    },
  },
};

// ---------------- save_life_story (T1): her story book ----------------
const storyShape = {
  elder_id, call_id,
  title: z.string().min(3).max(80).describe("A short chapter title in English, e.g. 'The wedding in Mysuru'"),
  story: z.string().min(40).max(2400).describe("Her story retold in English in her own voice (first person), keep her words and details"),
  era: z.string().max(40).optional().describe("Childhood / Young years / Raising a family / Adventures / Recipes / Wisdom"),
  people: z.array(z.string().max(40)).max(8).optional(),
  place: z.string().max(60).optional(),
  ask_id: z.string().optional().describe("From story_prompt when a family member asked the question"),
  prompt_id: z.string().optional().describe("From story_prompt when it was a bank question"),
  share_with_family: z.boolean().describe("Did she say yes to keeping it for the family? Ask first."),
};
export const save_life_story: AgentTool<typeof storyShape> = {
  description: "She told a story from her life (childhood, wedding, raising children, a recipe, advice). Ask 'Shall I keep this story for the family?' and save it. If she says no, set share_with_family false and it stays private.",
  shape: storyShape,
  spec: {
    name: "save_life_story", tier: "T1",
    label: (a, r) => r.kept_private ? "📖 Story kept private (her choice)" : `📖 New chapter in her story book: "${a.title}"`,
    run: async (a, { elder }) => { await ensureCall(elder.elderId, a.call_id); return saveStory(elder, a); },
  },
};

// ---------------- log_brain_game (T1): mind gym ----------------
const gameShape = {
  elder_id, call_id,
  game: z.enum(["word_recall", "category_naming", "story_recall"]),
  score: z.number().int().min(0).max(15),
  max: z.number().int().min(1).max(15),
  detail: z.string().max(60).optional(),
};
export const log_brain_game: AgentTool<typeof gameShape> = {
  description: "Log the result of today's playful memory game from brain_game (words remembered, or how many items she named). Never call it a test.",
  shape: gameShape,
  spec: {
    name: "log_brain_game", tier: "T1",
    label: (a) => `🧩 Mind game: ${a.game === "word_recall" ? "remembered" : "named"} ${a.score}/${a.max}${a.detail ? ` ${a.detail}` : ""}`,
    run: async (a, { elder }) => { await ensureCall(elder.elderId, a.call_id); return logGame(elder, a); },
  },
};

export const PHASE1_TOOLS = {
  get_today_context, recall_memory, mark_message_delivered, set_reminder, request_callback,
  update_call_preferences, record_consent, raise_emergency, log_scam_drill, request_appointment,
  get_shared_with_family, keep_private, log_life_certificate, relay_wish,
  log_vital, add_need, save_life_story, log_brain_game,
};

