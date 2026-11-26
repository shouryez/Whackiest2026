import { z } from "zod";
import type { Digest, Elder } from "@kaiseho/shared";
import { redactPII } from "../../control/redact";
import { env } from "../../env";
import { emit } from "../../engine/events";
import { localDate, newId, nowIso } from "../../engine/ids";
import { llmJson } from "../../engine/llm";
import { escapeHtml, sendTelegram, sendTelegramAudio } from "../../engine/notify/telegram";
import { every } from "../../engine/scheduler";
import { readAudio, synthesize } from "../../engine/tts";
import { getRepo } from "../../repo";
import { weeklySummary } from "./family";
import { conversationStarters } from "./nudges";
import { filterForFamily } from "./views";
import { pr } from "./pronouns";

/**
 * Weekly audio digest (plan.md P1-8, Section 8.7 / 14.5): Sunday 8 PM, a warm 60–90 s
 * spoken script → ElevenLabs TTS (brand voice) → MP3 → Telegram audio + dashboard player.
 * Ends with one conversation starter and "give her a call this week". Max 2–3 numbers.
 */
const ScriptSchema = z.object({ script: z.string().min(200).max(1600) });

function rulesScript(elder: Elder, s: Awaited<ReturnType<typeof weeklySummary>>, starter: string, moment?: string): string {
  const n = elder.preferredName;
  const p = pr(elder);
  const num = s.numbers;
  const parts: string[] = [`Hello Ravi. Here's your week with ${n}.`];
  if (num.adherencePct !== null) {
    parts.push(num.adherencePct >= 90
      ? `${p.She} kept up with ${p.hers} medicines really well this week, about ${num.adherencePct} percent of doses.`
      : `${p.Her} medicines slipped a little this week: ${p.she} took about ${num.adherencePct} percent of doses, so a gentle reminder from you would help.`);
  }
  if (num.moodAvg !== null) {
    const up = num.moodPrev !== null && num.moodAvg >= num.moodPrev;
    parts.push(num.moodAvg >= 3.5
      ? `${p.Her} spirits were good${up ? ", even better than last week" : ""}.`
      : `${p.She} had a few quieter days this week${up ? `, though ${p.she} is picking up again` : `, and ${p.she} would love to hear your voice`}.`);
  }
  if (num.painFirst !== null && num.painLast !== null) {
    parts.push(num.painLast < num.painFirst ? `The good news: the pain is easing.` : num.painLast > num.painFirst ? `The pain has been bothering ${p.her} more; it may be worth a word with ${p.hers} doctor.` : `The pain is about the same.`);
  }
  if (moment) parts.push(`One sweet moment: ${moment.replace(/[.?!]+$/, "")}.`);
  if (num.openAlerts > 0) parts.push(`There's still ${num.openAlerts === 1 ? "one alert" : `${num.openAlerts} alerts`} waiting for you in the app.`);
  parts.push(`Something to talk about: ${starter.replace(/^Ask /, "ask ").replace(/[.?!]+$/, "")}.`);
  parts.push(`You called ${p.her} ${num.familyCallsThisWeek === 1 ? "once" : `${num.familyCallsThisWeek} times`} this week. Give ${p.her} a call this week. It will make ${p.hers} day.`);
  return parts.join(" ");
}

export async function buildDigest(elder: Elder, opts: { send?: boolean } = { send: true }): Promise<Digest> {
  const repo = getRepo();
  const summary = await weeklySummary(elder, 7);
  const starters = await conversationStarters(elder);
  const starter = starters[0]?.starter ?? "Ask what she cooked today";
  const { privateCount } = await filterForFamily(elder);

  const llm = await llmJson({
    system: "Write a warm 60–90 second spoken audio digest for an adult child about their elderly parent's week, from a daily AI check-in service. Plain spoken English, no lists, no more than 3 numbers, never medical advice, never private items. Structure: warm opening, medicines, how she felt (trend in words), one sweet moment, anything to act on, one conversation starter, close with 'give her a call this week'. JSON: {script}",
    schema: ScriptSchema,
    user: JSON.stringify({ child: "Ravi", parent: elder.preferredName, week: summary, starter, private_items_excluded: privateCount }),
    timeoutMs: 15000,
  });
  const { memories } = await filterForFamily(elder);
  const moment = memories.filter((m) => m.type === "plan" || m.type === "story" || m.type === "preference" || m.type === "person").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.text;
  const script = redactPII(llm?.script ?? rulesScript(elder, summary, starter, moment));
  const [weekStart, weekEnd] = summary.period.split(" to ");
  const digestId = newId("dig");
  const audio = await synthesize(script, digestId);
  const digest: Digest = { familyId: elder.familyId, elderId: elder.elderId, digestId, weekStart, weekEnd, script, audio: audio ?? undefined, source: llm ? "llm" : "rules", createdAt: nowIso(), sentVia: ["dashboard"] };
  await repo.putDigest(digest);

  if (opts.send) {
    const members = (await repo.listMembers(elder.familyId)).filter((m) => m.role !== "neighbour");
    for (const m of members) {
      const chatId = m.telegramChatId ?? (m.role === "primary" ? env.TELEGRAM_DEMO_CHAT_ID : undefined);
      if (!chatId) continue;
      const caption = `🎧 <b>This week with ${escapeHtml(elder.preferredName)}</b> (${weekStart.slice(5)} → ${weekEnd.slice(5)})\n💡 ${escapeHtml(starter)}`;
      const mp3 = audio ? await readAudio(audio.file) : null;
      const ok = mp3 ? await sendTelegramAudio(chatId, mp3, `this-week-with-${elder.preferredName.toLowerCase()}.mp3`, caption) : await sendTelegram(chatId, `${caption}\n\n${escapeHtml(script)}`);
      if (ok) digest.sentVia.push(`telegram:${m.name}`);
    }
    await repo.putDigest(digest);
  }
  emit("digest.ready", elder.familyId, { digestId, hasAudio: Boolean(audio), source: digest.source, sentVia: digest.sentVia }, elder.elderId);
  return digest;
}

/** Sunday 20:00 (elder's local time) by default: DIGEST_DAY / DIGEST_TIME. */
export function startDigestTicker(): void {
  if (!env.ENABLE_DAILY_CALLS) return;
  every("digest-ticker", 60_000, async () => {
    const repo = getRepo();
    for (const elder of await repo.listAllElders()) {
      if (elder.status === "pending_consent") continue;
      const now = new Date();
      const hm = new Intl.DateTimeFormat("en-GB", { timeZone: elder.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
      const dow = new Date(`${localDate(elder.tz)}T00:00:00Z`).getUTCDay();
      if (dow !== env.DIGEST_DAY || hm !== env.DIGEST_TIME) continue;
      const done = (await repo.listDigests(elder.elderId)).some((d) => d.createdAt.slice(0, 10) === now.toISOString().slice(0, 10));
      if (!done) await buildDigest(elder);
    }
  });
}
