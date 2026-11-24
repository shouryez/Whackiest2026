import { z } from "zod";
import type { Call, CallSummary, Elder, Memory, Turn } from "@kaiseho/shared";
import { redactPII } from "../../control/redact";
import { llmJson } from "../../engine/llm";
import { localDate } from "../../engine/ids";
import { getRepo } from "../../repo";

/**
 * Post-call insight pass (plan.md Section 14.1). Tool logs are the source of truth for
 * meds/wellbeing; the transcript (already redacted) only fills gaps. Never diagnoses.
 * LLM when configured, deterministic rules otherwise (labelled source: "rules").
 */
const InsightSchema = z.object({
  family_summary_en: z.string(),
  family_summary_native: z.string(),
  highlights: z.array(z.string()).max(6),
  flags: z.array(z.object({ type: z.string(), severity: z.enum(["watch", "urgent"]), evidence: z.string() })).max(6),
  new_memories: z.array(z.object({
    type: z.enum(["person", "event", "health", "preference", "story", "plan"]),
    text: z.string(), importance: z.number().int().min(1).max(5), follow_up_after_days: z.number().int().min(0).max(60).optional(), private: z.boolean(),
  })).max(5),
  memory_updates: z.array(z.object({ memory_id: z.string(), follow_up_done: z.boolean() })).max(10),
  next_call_follow_ups: z.array(z.string()).max(3),
});
export type Insight = z.infer<typeof InsightSchema>;

export interface CallFacts {
  mood?: number; sleep?: string; pain?: { where: string; level: number };
  meds: { name: string; slot: string; status: string }[];
  scam?: { pattern: string; score: number };
  emergency?: string;
  savedMemories: string[];
  messagesDelivered: string[];
  messagesFromElder: string[];
}

export async function gatherFacts(elder: Elder, call: Call): Promise<CallFacts> {
  const repo = getRepo();
  const checkIn = await repo.getCheckIn(elder.elderId, call.callId);
  const meds = (await repo.listMedLogs(elder.elderId)).filter((l) => l.callId === call.callId);
  const audit = (await repo.listAudit(elder.elderId)).filter((a) => a.callId === call.callId && a.ok);
  const alerts = (await repo.listAlerts(elder.familyId)).filter((a) => (a.data as { callId?: string }).callId === call.callId);
  const scamAlert = alerts.find((a) => a.type === "scam");
  const emergency = alerts.find((a) => a.type === "emergency");
  return {
    mood: checkIn?.mood, sleep: checkIn?.sleep, pain: checkIn?.pain,
    meds: meds.map((m) => ({ name: m.medName, slot: m.slot, status: m.status })),
    scam: scamAlert ? { pattern: String((scamAlert.data as { pattern?: string }).pattern ?? "scam"), score: Number((scamAlert.data as { score?: number }).score ?? 0) } : undefined,
    emergency: emergency?.title,
    savedMemories: audit.filter((a) => a.tool === "save_memory" && !(a.argsRedacted as { private?: boolean }).private).map((a) => String((a.argsRedacted as { text?: string }).text ?? "")),
    messagesDelivered: audit.filter((a) => a.tool === "mark_message_delivered").map((a) => a.resultSummary),
    messagesFromElder: audit.filter((a) => a.tool === "send_family_message").map((a) => String((a.argsRedacted as { text?: string }).text ?? "")),
  };
}

// ---------- rules fallback ----------
const MOOD_WORDS = ["", "very low", "low", "okay", "good", "very good"];
const NATIVE = {
  kn: { mood: (m: number) => ["", "ತುಂಬಾ ಬೇಸರದಲ್ಲಿದ್ದರು", "ಸ್ವಲ್ಪ ಬೇಸರದಲ್ಲಿದ್ದರು", "ಸಾಧಾರಣವಾಗಿದ್ದರು", "ಚೆನ್ನಾಗಿದ್ದರು", "ತುಂಬಾ ಖುಷಿಯಾಗಿದ್ದರು"][m], meds: "ಔಷಧಿ ತೆಗೆದುಕೊಂಡರು", missed: "ಔಷಧಿ ತಪ್ಪಿಸಿದರು", pain: "ನೋವು", scam: "ಮೋಸದ ಕರೆ ಬಗ್ಗೆ ಹೇಳಿದರು; KaiseHo ಎಚ್ಚರಿಸಿತು.", who: "ಅಮ್ಮ ಇಂದು" },
  hi: { mood: (m: number) => ["", "बहुत उदास थीं", "थोड़ी उदास थीं", "ठीक थीं", "अच्छी थीं", "बहुत ख़ुश थीं"][m], meds: "दवा ली", missed: "दवा छूट गई", pain: "दर्द", scam: "एक धोखे वाले फ़ोन के बारे में बताया; KaiseHo ने सावधान किया।", who: "अम्मा आज" },
  en: { mood: (m: number) => MOOD_WORDS[m], meds: "took medicines", missed: "missed a dose", pain: "pain", scam: "mentioned a scam call; KaiseHo warned her.", who: "Today she" },
} as const;

export function rulesInsight(elder: Elder, facts: CallFacts): Insight {
  const n = elder.preferredName;
  const s: string[] = [];
  const highlights: string[] = [];
  const flags: Insight["flags"] = [];

  if (facts.mood) s.push(`${n} sounded ${MOOD_WORDS[facts.mood]} today (mood ${facts.mood}/5)${facts.sleep ? ` and slept ${facts.sleep === "ok" ? "okay" : facts.sleep}` : ""}.`);
  const taken = facts.meds.filter((m) => m.status === "taken");
  const missed = facts.meds.filter((m) => m.status === "missed");
  if (taken.length) { s.push(`She took ${taken.map((m) => `${m.name} (${m.slot})`).join(", ")}.`); highlights.push(`Took ${taken.map((m) => m.name.split(" ")[0]).join(", ")} ✓`); }
  if (missed.length) { s.push(`She missed ${missed.map((m) => `${m.name} (${m.slot})`).join(", ")}.`); flags.push({ type: "missed_meds", severity: "watch", evidence: missed.map((m) => m.name).join(", ") }); }
  if (facts.pain) {
    s.push(`${facts.pain.where[0].toUpperCase() + facts.pain.where.slice(1)} pain ${facts.pain.level}/10.`);
    highlights.push(`${facts.pain.where} pain ${facts.pain.level}/10`);
    if (facts.pain.level >= 7) flags.push({ type: "pain_up", severity: "watch", evidence: `${facts.pain.where} ${facts.pain.level}/10` });
  }
  if (facts.mood && facts.mood <= 2) flags.push({ type: "low_mood", severity: "watch", evidence: `mood ${facts.mood}/5` });
  if (facts.scam) { s.push(`She mentioned a suspicious call (${facts.scam.pattern.replace("_", " ")}); KaiseHo told her it's a scam and alerted you. She has not sent money.`); highlights.push("Scam attempt blocked 🛡️"); flags.push({ type: "scam", severity: "urgent", evidence: facts.scam.pattern }); }
  if (facts.emergency) { s.push(`Emergency raised during the call: ${facts.emergency}.`); highlights.push("Emergency raised 🚑"); }
  for (const m of facts.savedMemories.slice(0, 2)) highlights.push(m.length > 60 ? m.slice(0, 57) + "…" : m);
  if (facts.messagesDelivered.length) highlights.push("Heard your message ✉️");
  if (facts.messagesFromElder.length) s.push(`She sent you a message: "${facts.messagesFromElder[0]}".`);
  if (!s.length) s.push(`${n} picked up and the check-in was short.`);

  const L = NATIVE[elder.primaryLanguage] ?? NATIVE.en;
  const native = [
    facts.mood ? `${L.who} ${L.mood(facts.mood)}.` : "",
    taken.length ? `${taken.map((m) => m.name.split(" ")[0]).join(", ")}: ${L.meds} ✓.` : "",
    missed.length ? `${missed.map((m) => m.name.split(" ")[0]).join(", ")}: ${L.missed}.` : "",
    facts.pain ? `${L.pain} ${facts.pain.level}/10.` : "",
    facts.scam ? L.scam : "",
  ].filter(Boolean).join(" ");

  return {
    family_summary_en: s.join(" "),
    family_summary_native: native || s.join(" "),
    highlights: highlights.slice(0, 6),
    flags,
    new_memories: [],
    memory_updates: [],
    next_call_follow_ups: [],
  };
}

const SYSTEM = `You write the post-call summary for KaiseHo, a short daily AI check-in call to an elderly Indian parent.
Rules: be factual and warm; never diagnose or give medical advice; tool logs are the source of truth for medicines and wellbeing;
never include items marked private; never include numbers like OTPs, account or ID numbers. Flags: missed_meds|low_mood|pain_up|confusion|loneliness|scam|health_question.
Return JSON: {family_summary_en (2-4 sentences for the child), family_summary_native (same in the elder's language), highlights[<=6 short],
flags[{type,severity:"watch"|"urgent",evidence}], new_memories[{type,text,importance 1-5,follow_up_after_days?,private:boolean}],
memory_updates[{memory_id,follow_up_done}], next_call_follow_ups[<=3]}`;

export async function runInsightPass(elder: Elder, call: Call, turns: Turn[], analysis: Record<string, unknown>, memories: Memory[]): Promise<{ insight: Insight; source: CallSummary["source"] }> {
  const facts = await gatherFacts(elder, call);
  const lang = { kn: "Kannada", hi: "Hindi", en: "English" }[elder.primaryLanguage];
  const llm = await llmJson({
    system: SYSTEM,
    schema: InsightSchema,
    user: JSON.stringify({
      elder: { preferred_name: elder.preferredName, language: lang, conditions: elder.conditions },
      tool_logs: facts,
      data_collection: analysis,
      existing_memories: memories.filter((m) => !m.private).map((m) => ({ memory_id: m.memoryId, text: m.text, follow_up_after: m.followUpAfter, done: m.followUpDone })),
      private_topics: memories.filter((m) => m.private).map((m) => m.type),
      transcript: turns.map((t) => `${t.role === "elder" ? elder.preferredName : "KaiseHo"}: ${t.text}`).join("\n").slice(-12000),
      today: localDate(elder.tz),
    }),
  });
  if (llm) {
    // Defence in depth: the model output is redacted too.
    llm.family_summary_en = redactPII(llm.family_summary_en);
    llm.family_summary_native = redactPII(llm.family_summary_native);
    return { insight: llm, source: "llm" };
  }
  return { insight: rulesInsight(elder, facts), source: "rules" };
}
