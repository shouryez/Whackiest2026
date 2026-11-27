import { z } from "zod";
import type { Elder, Nudge } from "@kaiseho/shared";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { llmJson } from "../../engine/llm";
import { escapeHtml, sendTelegram } from "../../engine/notify/telegram";
import { env } from "../../env";
import { getRepo } from "../../repo";
import { filterForFamily } from "./views";
import { pr } from "./pronouns";
import { callRota } from "./rota";

/**
 * Family nudges + conversation starters (plan.md P0-13) and the headline metric
 * "family calls this week" (P0-14). KaiseHo's success = MORE human calls, not fewer.
 */

// ---------- family calls metric ----------
/** "This week" = the rolling last 7 days (stable on any weekday), compared with the 7 days before. */
export async function familyCallStats(elder: Elder) {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const from = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const all = await repo.listFamilyCalls(elder.elderId);
  const day = (f: { at: string }) => localDate(elder.tz, new Date(f.at));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return {
    thisWeek: all.filter((f) => day(f) >= from).length,
    lastWeek: all.filter((f) => day(f) >= prevFrom && day(f) < from).length,
    byDay: days.map((d) => ({ date: d, count: all.filter((f) => day(f) === d).length })),
    lastCallAt: all.map((f) => f.at).sort().at(-1),
  };
}

export async function logFamilyCall(elder: Elder, by: string, source: "button" | "elder_mentioned") {
  const repo = getRepo();
  const fc = { familyId: elder.familyId, elderId: elder.elderId, id: newId("fc"), by, source, at: nowIso() };
  await repo.putFamilyCall(fc);
  for (const n of (await repo.listNudges(elder.elderId)).filter((n) => n.status === "open")) {
    n.status = "done";
    await repo.putNudge(n);
  }
  emit("family_call.logged", elder.familyId, { by, source, stats: await familyCallStats(elder) }, elder.elderId);
  return fc;
}

// ---------- conversation starters ----------
const StartersSchema = z.object({ starters: z.array(z.object({ starter: z.string(), why: z.string() })).min(1).max(3) });

export async function conversationStarters(elder: Elder): Promise<{ starter: string; why: string }[]> {
  const repo = getRepo();
  const { memories } = await filterForFamily(elder);
  const since = addDays(localDate(elder.tz), -14);
  const recent = memories.filter((m) => m.createdAt.slice(0, 10) >= since).sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt));
  const calls = (await repo.listCalls(elder.elderId)).filter((c) => c.summary).slice(0, 5);

  const llm = await llmJson({
    system: "You suggest 3 specific, warm conversation starters a busy adult child can use when calling their elderly parent tonight. Use only the facts given. Never medical advice. JSON: {starters:[{starter, why}]}",
    schema: StartersSchema,
    user: JSON.stringify({ parent: elder.preferredName, memories: recent.map((m) => m.text), recent_highlights: calls.flatMap((c) => c.summary!.highlights) }),
    timeoutMs: 8000,
  });
  if (llm) return llm.starters;

  const out: { starter: string; why: string }[] = [];
  for (const m of recent) {
    if (out.length >= 3) break;
    const t = m.text.replace(/\.$/, "");
    if (m.type === "event" || m.type === "plan") out.push({ starter: `Ask how it went: ${t}`, why: "She mentioned it in a recent check-in" });
    else if (m.type === "health") out.push({ starter: `Ask gently whether the ${t.charAt(0).toLowerCase() + t.slice(1)} is better`, why: "A health complaint she raised" });
    else if (m.type === "person") out.push({ starter: `Ask about ${t}`, why: "Someone she talked about" });
    else if (m.type === "preference" || m.type === "story") out.push({ starter: `Bring up: ${t}`, why: "Something she enjoys talking about" });
  }
  const scam = calls.find((c) => c.summary!.flags.some((f) => f.type === "scam"));
  if (scam && out.length < 3) out.unshift({ starter: "Reassure her about the scam call: she did the right thing by not sending money", why: "She had a scam scare and may still be shaken" });
  if (out.length < 3) out.push({ starter: "Ask what she cooked today and who she met", why: "Everyday details keep the conversation easy" });
  return out.slice(0, 3);
}

// ---------- nudges ("when to call") ----------
export async function computeNudge(elder: Elder): Promise<Nudge | null> {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const checkIns = await repo.listCheckIns(elder.elderId, addDays(today, -6));
  const lastThree = checkIns.slice(-3);
  const n = elder.preferredName;
  const p = pr(elder);
  const alerts = (await repo.listAlerts(elder.familyId)).filter((a) => a.elderId === elder.elderId && a.createdAt.slice(0, 10) >= addDays(today, -1));
  const missed = (await repo.listMedLogs(elder.elderId, addDays(today, -1))).filter((l) => l.status === "missed");
  const stats = await familyCallStats(elder);
  const daysSinceFamilyCall = stats.lastCallAt ? Math.floor((Date.now() - new Date(stats.lastCallAt).getTime()) / 86400000) : 99;

  let text = "";
  let reason = "";
  if (alerts.some((a) => a.type === "scam")) {
    text = `${n} had a scam scare today${lastThree.at(-1)?.pain ? ` and mentioned ${p.hers} ${lastThree.at(-1)!.pain!.where}` : ""}. Call ${p.her} tonight?`; reason = "scam";
  } else if (lastThree.length >= 3 && lastThree.every((c) => (c.mood ?? 5) <= 2)) {
    text = `${n} sounded low 3 days in a row. Call ${p.her} tonight?`; reason = "low_mood";
  } else if (missed.length >= 2) {
    text = `${n} missed ${missed.length} doses in 2 days. A gentle call might help.`; reason = "missed_meds";
  } else if (lastThree.length >= 2 && (lastThree.at(-1)?.pain?.level ?? 0) - (lastThree[0]?.pain?.level ?? 0) >= 2) {
    text = `${n}'s ${lastThree.at(-1)!.pain!.where} pain is rising. Worth a call, and maybe a doctor visit.`; reason = "pain_up";
  } else if (daysSinceFamilyCall >= 3) {
    const rota = await callRota(elder);
    const turn = rota.nextUp && rota.members.length > 1 ? `${rota.nextUp.name}, it's your turn: ` : "";
    text = `${turn}it's been ${daysSinceFamilyCall > 30 ? "a while" : `${daysSinceFamilyCall} days`} since anyone called ${n}. ${p.She} brightens after calls.`; reason = "no_recent_call";
  } else {
    return null;
  }

  const open = (await repo.listNudges(elder.elderId)).find((x) => x.status === "open" && x.reason === reason && x.createdAt.slice(0, 10) === nowIso().slice(0, 10));
  if (open) return open;

  const nudge: Nudge = { elderId: elder.elderId, nudgeId: newId("ndg"), text, reason, starters: await conversationStarters(elder), createdAt: nowIso(), status: "open" };
  await repo.putNudge(nudge);
  emit("nudge.created", elder.familyId, { nudge }, elder.elderId);

  const members = await repo.listMembers(elder.familyId);
  const primary = members.find((m) => m.role === "primary");
  // Rota: the "your turn" nudge goes to that sibling if they've linked Telegram.
  const turnName = reason === "no_recent_call" ? (await callRota(elder)).nextUp?.name : undefined;
  const target = members.find((m) => m.name === turnName && m.telegramChatId);
  const chatId = target?.telegramChatId ?? primary?.telegramChatId ?? env.TELEGRAM_DEMO_CHAT_ID;
  if (chatId) {
    await sendTelegram(chatId, `💡 <b>${escapeHtml(text)}</b>\nAsk: "${escapeHtml(nudge.starters[0]?.starter ?? "")}"`, [
      [{ text: "☎️ I called her", callback_data: `called:${elder.elderId}` }],
    ]);
  }
  return nudge;
}
