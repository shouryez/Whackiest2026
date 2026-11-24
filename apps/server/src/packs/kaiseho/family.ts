import type { Elder } from "@kaiseho/shared";
import { addDays, localDate } from "../../engine/ids";
import { getRepo } from "../../repo";
import { familyCallStats } from "./nudges";
import { filterForFamily } from "./views";

/**
 * Family read models: one implementation used by the dashboard REST API and the
 * /mcp/family tools (Claude). Everything goes through filterForFamily (elder's choices).
 */
export async function trends(elder: Elder, days = 14) {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const since = addDays(today, -(days - 1));
  const checkIns = await repo.listCheckIns(elder.elderId, since);
  const logs = await repo.listMedLogs(elder.elderId, since);
  const series = Array.from({ length: days }, (_, i) => {
    const date = addDays(since, i);
    const c = checkIns.filter((x) => x.date === date).at(-1);
    const l = logs.filter((x) => x.date === date);
    return {
      date,
      mood: elder.privacy.shareWellbeing ? c?.mood ?? null : null,
      sleep: elder.privacy.shareWellbeing ? (c?.sleep === "good" ? 3 : c?.sleep === "ok" ? 2 : c?.sleep === "poor" ? 1 : null) : null,
      pain: elder.privacy.shareWellbeing ? c?.pain?.level ?? null : null,
      adherence: elder.privacy.shareMedicines && l.length ? Math.round((l.filter((x) => x.status === "taken").length / l.length) * 100) : null,
      taken: l.filter((x) => x.status === "taken").length,
      missed: l.filter((x) => x.status === "missed").length,
    };
  });
  return series;
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export async function weeklySummary(elder: Elder, days = 7) {
  const repo = getRepo();
  const series = await trends(elder, days);
  const prev = (await trends(elder, days * 2)).slice(0, days);
  const since = series[0].date;
  const calls = (await repo.listCalls(elder.elderId)).filter((c) => c.startedAt && c.startedAt.slice(0, 10) >= since);
  const alerts = (await repo.listAlerts(elder.familyId)).filter((a) => a.elderId === elder.elderId && a.createdAt.slice(0, 10) >= since && a.severity !== "info");
  const logs = (await repo.listMedLogs(elder.elderId, since));
  const missed = logs.filter((l) => l.status === "missed");
  const stats = await familyCallStats(elder);
  const { memories } = await filterForFamily(elder);
  const moodAvg = avg(series.map((s) => s.mood));
  const moodPrev = avg(prev.map((s) => s.mood));
  const painFirst = series.find((s) => s.pain !== null)?.pain ?? null;
  const painLast = [...series].reverse().find((s) => s.pain !== null)?.pain ?? null;
  const lowDays = series.filter((s) => s.mood !== null && s.mood <= 2).map((s) => s.date);

  const n = elder.preferredName;
  const lines: string[] = [];
  if (elder.privacy.shareMedicines) lines.push(`Medicines: ${logs.length - missed.length}/${logs.length} doses taken${missed.length ? ` (missed: ${missed.map((m) => `${m.medName.split(" ")[0]} ${m.slot} on ${m.date.slice(5)}`).slice(0, 3).join(", ")})` : ""}.`);
  if (moodAvg !== null) lines.push(`Mood averaged ${moodAvg}/5${moodPrev !== null ? ` (${moodAvg >= moodPrev ? "up" : "down"} from ${moodPrev} the week before)` : ""}${lowDays.length ? `; low on ${lowDays.map((d) => d.slice(5)).join(", ")}` : ""}.`);
  if (painFirst !== null && painLast !== null) lines.push(`Pain went from ${painFirst}/10 to ${painLast}/10.`);
  for (const a of alerts.slice(0, 3)) lines.push(`⚠️ ${a.title}${a.status === "acked" ? " (acknowledged)" : " (open)"}.`);
  lines.push(`Family calls this week: ${stats.thisWeek} (last week ${stats.lastWeek}).`);

  return {
    elder: n,
    period: `${since} to ${series.at(-1)!.date}`,
    narrative: `${n}'s week: ${lines.join(" ")}`,
    numbers: {
      adherencePct: logs.length ? Math.round(((logs.length - missed.length) / logs.length) * 100) : null,
      moodAvg, moodPrev, painFirst, painLast,
      callsCompleted: calls.filter((c) => c.status === "completed").length,
      familyCallsThisWeek: stats.thisWeek, familyCallsLastWeek: stats.lastWeek,
      openAlerts: alerts.filter((a) => a.status === "open").length,
    },
    highlights: calls.flatMap((c) => c.summary?.highlights ?? []).slice(0, 6),
    recentMemories: memories.slice(-5).map((m) => m.text),
  };
}

export async function timeline(elder: Elder, days = 14) {
  const repo = getRepo();
  const since = addDays(localDate(elder.tz), -days);
  const calls = (await repo.listCalls(elder.elderId)).filter((c) => (c.startedAt ?? "") >= since);
  return Promise.all(calls.map(async (c) => {
    const ci = await repo.getCheckIn(elder.elderId, c.callId);
    const turns = await repo.listTurns(c.callId);
    return {
      callId: c.callId, reason: c.reason, status: c.status, mode: c.mode, startedAt: c.startedAt, endedAt: c.endedAt, durationSec: c.durationSec,
      summary: c.summary, qualityChecks: c.qualityChecks,
      mood: elder.privacy.shareWellbeing ? ci?.mood : undefined,
      transcriptAvailable: turns.length > 0,
      transcriptPurgeAt: turns[0]?.purgeAt,
    };
  }));
}

/** "What KaiseHo stored today" for the privacy panel. */
export async function storedToday(elder: Elder) {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const audit = (await repo.listAudit(elder.elderId)).filter((a) => localDate(elder.tz, new Date(a.ts)) === today && a.ok && (a.tier === "T1" || a.tier === "T3"));
  return audit.map((a) => a.resultSummary).slice(0, 12);
}
