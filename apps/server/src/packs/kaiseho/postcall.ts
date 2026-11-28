import type { Call, Turn } from "@kaiseho/shared";
import { redactPII } from "../../control/redact";
import { env } from "../../env";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import type { PostCallHooks, PostCallPayload } from "../../engine/postcall";
import { every } from "../../engine/scheduler";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { onNoAnswer } from "./calls";
import { runInsightPass } from "./insights";
import { computeNudge, logFamilyCall } from "./nudges";
import { pr } from "./pronouns";
import { flagChanges } from "./health";
import { occasionFamilyNudges } from "./occasions";
import { markNeedsTold } from "./needs";
import { sendCallCard } from "./telegramBot";

/**
 * KaiseHo's post-call brain (plan.md Section 8.6 steps 2–10).
 */
async function resolveCall(p: PostCallPayload): Promise<Call | undefined> {
  const repo = getRepo();
  const byConv = await repo.getCallByConversation(p.data.conversation_id);
  if (byConv) return byConv;
  const dv = p.data.conversation_initiation_client_data?.dynamic_variables ?? {};
  const elderId = typeof dv.elder_id === "string" ? dv.elder_id : undefined;
  const callId = typeof dv.call_id === "string" ? dv.call_id : undefined;
  if (!elderId || !callId) return undefined;
  const existing = await repo.getCall(elderId, callId);
  if (existing) {
    existing.conversationId = p.data.conversation_id;
    return existing;
  }
  if (!(await repo.getElder(elderId))) return undefined;
  return { elderId, callId, reason: String(dv.call_reason ?? "daily"), status: "in_progress", attempt: 1, startedAt: nowIso(), familyMessagesSent: 0, conversationId: p.data.conversation_id, mode: "browser" };
}

const FAMILY_CALL_RE = /\b(called|phoned|spoke|talked|video ?call(ed)?)\b|फ़ोन किया|फोन किया|बात की|ಕರೆ ಮಾಡಿದ|ಫೋನ್ ಮಾಡಿದ|ಮಾತಾಡಿದ/i;

async function onTranscript(p: PostCallPayload): Promise<void> {
  const repo = getRepo();
  const call = await resolveCall(p);
  if (!call) {
    console.warn("[postcall] unknown conversation", p.data.conversation_id);
    return;
  }
  const elder = await repo.getElder(call.elderId);
  if (!elder) return;

  // 3. Redact + store turns (text only, never audio), purged after TRANSCRIPT_RETENTION_HOURS.
  const purgeAt = new Date(Date.now() + env.TRANSCRIPT_RETENTION_HOURS * 3600_000).toISOString();
  const turns: Turn[] = p.data.transcript
    .filter((t) => t.message)
    .map((t, idx) => ({ callId: call.callId, elderId: elder.elderId, idx, role: t.role === "agent" ? "agent" : "elder", text: redactPII(String(t.message)), purgeAt }));
  if (turns.length) await repo.putTurns(turns);

  // 4. Structured fields from ElevenLabs analysis.
  const dc = Object.fromEntries(Object.entries(p.data.analysis?.data_collection_results ?? {}).map(([k, v]) => [k, v.value]));
  const evals = Object.fromEntries(Object.entries(p.data.analysis?.evaluation_criteria_results ?? {}).map(([k, v]) => [k, v.result === "success"]));

  // Fill wellbeing gaps from data collection if the agent didn't log them (tools win).
  const ci = await repo.getCheckIn(elder.elderId, call.callId);
  const moodDc = Number(dc.mood_score);
  if (!ci?.mood && moodDc >= 1 && moodDc <= 5) {
    await repo.putCheckIn({ elderId: elder.elderId, callId: call.callId, date: localDate(elder.tz), ...ci, mood: moodDc, sleep: ci?.sleep ?? (["good", "ok", "poor"].includes(String(dc.sleep_quality)) ? (dc.sleep_quality as "good" | "ok" | "poor") : undefined), updatedAt: nowIso() });
  }

  // 5–6. Insight pass (LLM or rules), reconciled with tool logs inside.
  const memories = await repo.listMemories(elder.elderId);
  const { insight, source } = await runInsightPass(elder, call, turns, { ...dc, transcript_summary: p.data.analysis?.transcript_summary }, memories);

  for (const m of insight.new_memories) {
    await repo.putMemory({
      elderId: elder.elderId, memoryId: newId("mem"), type: m.type, text: redactPII(m.text), importance: m.importance, private: m.private,
      followUpAfter: m.follow_up_after_days !== undefined ? addDays(localDate(elder.tz), m.follow_up_after_days) : undefined,
      followUpDone: false, source: "postcall", lastMentionedAt: nowIso(), createdAt: nowIso(),
    });
  }
  for (const u of insight.memory_updates) {
    const m = await repo.getMemory(elder.elderId, u.memory_id);
    if (m) { m.followUpDone = u.follow_up_done; m.lastMentionedAt = nowIso(); await repo.putMemory(m); }
  }
  // Rules: a follow-up the agent was given counts as asked once the call completes.
  if (source === "rules") {
    const today = localDate(elder.tz);
    for (const m of memories.filter((m) => !m.private && m.followUpAfter && m.followUpAfter <= today && !m.followUpDone)) {
      const words = m.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const said = turns.some((t) => words.some((w) => t.text.toLowerCase().includes(w)));
      if (said || turns.length === 0) { m.followUpDone = true; await repo.putMemory(m); }
    }
  }

  if (call.reason === "consent") {
    const c = await repo.getLatestConsent(elder.elderId);
    const p = pr(elder);
    const shared = c ? [c.shareMedicines && "medicines", c.shareWellbeing && "mood & health", c.shareMemories && "memories"].filter(Boolean).join(", ") : "";
    insight.family_summary_en = c
      ? `${elder.preferredName} ${c.dailyCalls ? `agreed to a short daily check-in at ${c.preferredTime ?? elder.callTimeLocal}` : "said no to daily calls for now"}. ${p.She} ${elder.gender ? "is" : "are"} happy to share: ${shared || "only safety alerts"}.${!c.shareMemories ? ` ${p.She} asked to keep ${p.hers} personal stories private.` : ""} Safety alerts (scams, emergencies) always reach you; ${p.she} ${elder.gender ? "knows" : "know"} that.`
      : `${elder.preferredName} picked up the welcome call but hasn't given consent yet. No daily calls are scheduled.`;
    insight.highlights = c ? ["Consent recorded 🤝", c.dailyCalls ? `Daily at ${c.preferredTime ?? elder.callTimeLocal}` : "No daily calls"] : ["No consent yet"];
    insight.flags = [];
  }
  // Gaps the agent didn't log (appetite / company / activity / a good moment) from the insight pass.
  const wb = insight.wellbeing;
  if (wb && (wb.appetite || wb.social || wb.activity || wb.highlight)) {
    const cur = await repo.getCheckIn(elder.elderId, call.callId);
    await repo.putCheckIn({ elderId: elder.elderId, callId: call.callId, date: cur?.date ?? localDate(elder.tz), ...cur,
      appetite: cur?.appetite ?? wb.appetite, social: cur?.social ?? wb.social, activity: cur?.activity ?? wb.activity,
      highlight: cur?.highlight ?? (wb.highlight ? redactPII(wb.highlight) : undefined), updatedAt: nowIso() });
  }
  const voice = voiceVitality(p.data.transcript as { role: string; message?: string | null; time_in_call_secs?: number }[]);
  if (voice) call.voice = voice;
  const ciNow = await repo.getCheckIn(elder.elderId, call.callId);
  call.status = "completed";
  call.endedAt = nowIso();
  call.durationSec = p.data.metadata?.call_duration_secs;
  call.qualityChecks = Object.keys(evals).length ? evals : undefined;
  call.summary = { family_en: insight.family_summary_en, family_native: insight.family_summary_native, highlights: insight.highlights, flags: insight.flags, mood: ciNow?.mood, source };
  await repo.putCall(call);
  emit("call.ended", elder.familyId, { callId: call.callId, status: "completed", durationSec: call.durationSec }, elder.elderId);
  emit("summary.ready", elder.familyId, { callId: call.callId, summary: call.summary }, elder.elderId);
  // The daily Telegram card (summary + reply / call / list buttons), after alerts from the same call.
  setTimeout(() => void sendCallCard(elder, call).catch((err) => console.warn("[telegram] call card", (err as Error).message)), 1500);

  // 8. Family call mentioned by the elder ("Ravi called yesterday") counts toward the headline metric.
  const members = await repo.listMembers(elder.familyId);
  for (const m of members.filter((m) => m.role !== "neighbour")) {
    const mentioned = turns.some((t) => t.role === "elder" && t.text.toLowerCase().includes(m.name.toLowerCase()) && FAMILY_CALL_RE.test(t.text));
    if (mentioned) await logFamilyCall(elder, m.name, "elder_mentioned");
  }

  // 10. Alerts for flags not already alerted by a T3 tool (scam/emergency alert in-call).
  for (const f of insight.flags.filter((f) => f.type !== "scam")) {
    if (f.type === "low_mood" || f.type === "missed_meds" || f.type === "pain_up" || f.type === "confusion" || f.type === "loneliness") {
      await createAlert({
        elder, severity: f.severity, type: f.type === "missed_meds" ? "missed_meds" : f.type === "low_mood" || f.type === "loneliness" ? "low_mood" : "health_change",
        title: { low_mood: "Sounded low today", missed_meds: "Missed a medicine", pain_up: "Pain is up", confusion: "Seemed confused", loneliness: "Feeling lonely" }[f.type] ?? f.type,
        body: f.evidence, data: { callId: call.callId, flag: f.type },
      });
    }
  }
  await computeNudge(elder);
  await flagChanges(elder);
  await markNeedsTold(elder, call.startedAt ?? nowIso()).catch(() => {});
  await occasionFamilyNudges(elder).catch((err) => console.warn("[occasions]", (err as Error).message));
}

/**
 * Voice vitality: her speaking pace (words per minute) and how long she takes to reply, from turn timestamps.
 * Approximate by design; only ever compared with her own usual, and only shown as "worth noting".
 */
export function voiceVitality(t: { role: string; message?: string | null; time_in_call_secs?: number }[]): { wpm: number; replyGapSec: number; turns: number } | undefined {
  const timed = t.filter((x) => typeof x.time_in_call_secs === "number" && x.message);
  let words = 0, secs = 0;
  const gaps: number[] = [];
  timed.forEach((x, i) => {
    const next = timed[i + 1];
    const w = String(x.message).trim().split(/\s+/).length;
    if (x.role !== "agent") {
      if (next) { const d = next.time_in_call_secs! - x.time_in_call_secs!; if (d > 0.5 && d < 60) { words += w; secs += d; } }
      const prev = timed[i - 1];
      if (prev && prev.role === "agent") {
        const agentSpeak = String(prev.message).trim().split(/\s+/).length / 2.6; // ~155 wpm TTS
        const gap = x.time_in_call_secs! - prev.time_in_call_secs! - agentSpeak;
        if (gap >= 0 && gap < 20) gaps.push(gap);
      }
    }
  });
  if (secs < 10 || gaps.length < 3) return undefined;
  gaps.sort((a, b) => a - b);
  return { wpm: Math.round((words / secs) * 60), replyGapSec: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10, turns: gaps.length };
}

async function onInitiationFailure(p: PostCallPayload): Promise<void> {
  const call = await resolveCall(p);
  if (!call) return;
  const elder = await getRepo().getElder(call.elderId);
  if (elder) await onNoAnswer(elder, call);
}

export const kaisehoPostCall: PostCallHooks = { onTranscript, onInitiationFailure };

/** Privacy job: raw transcript turns are deleted after TRANSCRIPT_RETENTION_HOURS. */
export async function purgeTranscripts(): Promise<number> {
  const n = await getRepo().purgeTurns(nowIso());
  if (n) console.log(`[privacy] purged ${n} transcript turns past retention`);
  return n;
}
export function startPurgeJob(): void {
  every("transcript-purge", 10 * 60_000, async () => { await purgeTranscripts(); });
}
