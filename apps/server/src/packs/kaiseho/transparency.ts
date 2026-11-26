import type { Elder } from "@kaiseho/shared";
import { localDate } from "../../engine/ids";
import { getRepo } from "../../repo";
import { filterForFamily } from "./views";

/**
 * "What did you tell Ravi?" (plan.md P2-13): the elder can ask what was shared, and hears exactly
 * what the family saw: the last summary, the alerts and her own messages. The same read-back is
 * shown to the family on the Privacy page, so both sides see one truth.
 */
export async function sharedReadback(elder: Elder, days = 3) {
  const repo = getRepo();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const today = localDate(elder.tz);
  const yesterday = localDate(elder.tz, new Date(Date.now() - 86400_000));
  const primary = (await repo.listMembers(elder.familyId)).find((m) => m.role === "primary")?.name ?? "your family";
  const whenOf = (iso: string) => {
    const d = localDate(elder.tz, new Date(iso));
    if (d === today) return "today";
    if (d === yesterday) return "yesterday";
    return `on ${new Intl.DateTimeFormat("en-IN", { timeZone: elder.tz, weekday: "long" }).format(new Date(iso))}`;
  };

  const call = (await repo.listCalls(elder.elderId))
    .filter((c) => c.status === "completed" && c.summary && (c.endedAt ?? c.startedAt ?? "") >= since)
    .sort((a, b) => (b.endedAt ?? b.startedAt ?? "").localeCompare(a.endedAt ?? a.startedAt ?? ""))[0];
  const alerts = (await repo.listAlerts(elder.familyId))
    .filter((a) => a.elderId === elder.elderId && a.createdAt >= since && a.type !== "message" && a.type !== "occasion") // wishes are listed as her messages
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((a) => ({ title: a.title, when: whenOf(a.createdAt), severity: a.severity, sentTo: a.notifiedVia.filter((v) => v.startsWith("telegram:")).map((v) => v.slice(9)) }));
  const messages = (await repo.listMessages(elder.elderId))
    .filter((m) => m.direction === "from_elder" && m.createdAt >= since)
    .slice(-3)
    .map((m) => ({ text: m.text, when: whenOf(m.createdAt) }));
  const { privateCount } = await filterForFamily(elder);
  const notShared = [!elder.privacy.shareMedicines && "medicines", !elder.privacy.shareWellbeing && "mood and health", !elder.privacy.shareMemories && "personal stories"].filter(Boolean) as string[];

  const parts: string[] = [];
  if (call?.summary) parts.push(`After our call ${whenOf(call.endedAt ?? call.startedAt!)}, I sent ${primary} this short note: "${call.summary.family_en}"`);
  else parts.push(`I haven't sent ${primary} any call summary in the last ${days} days.`);
  if (alerts.length) parts.push(`I also told the family: ${alerts.map((a) => `${a.title} (${a.when})`).join("; ")}.`);
  if (messages.length) parts.push(`Your own messages to them: ${messages.map((m) => `"${m.text}" (${m.when})`).join(", ")}.`);
  if (privateCount) parts.push(`The ${privateCount === 1 ? "one thing" : `${privateCount} things`} you asked me to keep private ${privateCount === 1 ? "was" : "were"} not shared.`);
  if (notShared.length) parts.push(`You chose not to share ${notShared.join(" or ")}, so I don't.`);
  parts.push("Only scams and emergencies always go to the family, for your safety.");

  return {
    familyContact: primary,
    lastSummary: call?.summary ? { text: call.summary.family_en, when: whenOf(call.endedAt ?? call.startedAt!), callId: call.callId } : null,
    alerts, messages, privateCount, notShared,
    say: parts.join(" "),
  };
}

/** "Don't tell Ravi about my knee": matching memories become private from now on (already-sent notes can't be unsent). */
export async function keepPrivate(elder: Elder, topic: string): Promise<{ hidden: number }> {
  const repo = getRepo();
  const words = topic.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  let hidden = 0;
  for (const m of await repo.listMemories(elder.elderId)) {
    if (m.private || !words.some((w) => m.text.toLowerCase().includes(w))) continue;
    await repo.putMemory({ ...m, private: true, followUpAfter: undefined });
    hidden++;
  }
  return { hidden };
}
