import type { Call, CheckIn, Elder } from "@kaiseho/shared";
import { addDays, localDate } from "../../engine/ids";
import { getRepo } from "../../repo";
import { pr } from "./pronouns";

/**
 * Wellbeing intelligence. The call never asks "rate your mood 1 to 5": KaiseHo talks about her day
 * (what she cooked, who she met, whether she stepped out) and logs six dimensions. Here they become
 * a 0-100 Wellbeing Index compared with HER OWN normal (not population averages), plus patterns
 * found with simple, explainable statistics. Never a diagnosis.
 */
export const DIMS = ["mood", "sleep", "appetite", "social", "activity", "pain"] as const;
export type Dim = (typeof DIMS)[number];
const WEIGHT: Record<Dim, number> = { mood: 0.25, sleep: 0.15, appetite: 0.15, social: 0.15, activity: 0.15, pain: 0.15 };
export const DIM_LABEL: Record<Dim, string> = { mood: "Mood", sleep: "Sleep", appetite: "Appetite", social: "People", activity: "Activity", pain: "Comfort" };

export function dimScores(c: Partial<CheckIn> | undefined): Partial<Record<Dim, number>> {
  if (!c) return {};
  const out: Partial<Record<Dim, number>> = {};
  if (c.mood !== undefined) out.mood = Math.round(((c.mood - 1) / 4) * 100);
  if (c.sleep) out.sleep = { good: 100, ok: 60, poor: 20 }[c.sleep];
  if (c.appetite) out.appetite = { good: 100, ok: 60, low: 25 }[c.appetite];
  if (c.social) out.social = { met_people: 100, phone_only: 65, alone: 20 }[c.social];
  if (c.activity) out.activity = { went_out: 100, active_home: 65, rested: 25 }[c.activity];
  if (c.pain) out.pain = Math.round((10 - c.pain.level) * 10);
  return out;
}

export function indexOf(scores: Partial<Record<Dim, number>>): number | null {
  let sum = 0, w = 0;
  for (const d of DIMS) if (scores[d] !== undefined) { sum += scores[d]! * WEIGHT[d]; w += WEIGHT[d]; }
  return w >= 0.3 ? Math.round(sum / w) : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
/** Least-squares slope per day. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 3) return 0;
  const xm = (n - 1) / 2, ym = mean(ys);
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  return den ? num / den : 0;
}

export interface DayPoint {
  date: string;
  index: number | null;
  dims: Partial<Record<Dim, number>>;
  mood?: number;
  pain?: number;
  sleep?: string;
  social?: string;
  activity?: string;
  highlight?: string;
  familyCall: boolean;
  missedDoses: number;
  weekday: number;
}

export async function wellbeingSeries(elder: Elder, days = 30, today = localDate(elder.tz)): Promise<DayPoint[]> {
  const repo = getRepo();
  const since = addDays(today, -(days - 1));
  const checkIns = await repo.listCheckIns(elder.elderId, since);
  const logs = await repo.listMedLogs(elder.elderId, since);
  const calls = await repo.listFamilyCalls(elder.elderId);
  const callDays = new Set(calls.map((c) => localDate(elder.tz, new Date(c.at))));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(since, i);
    // Merge the day's check-ins (a call may log in several steps).
    const c = checkIns.filter((x) => x.date === date).reduce<Partial<CheckIn>>((acc, x) => ({ ...acc, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) }), {});
    const dims = dimScores(c);
    return {
      date, index: indexOf(dims), dims, mood: c.mood, pain: c.pain?.level, sleep: c.sleep, social: c.social, activity: c.activity, highlight: c.highlight,
      familyCall: callDays.has(date), missedDoses: logs.filter((l) => l.date === date && l.status === "missed").length,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    };
  });
}

export interface Pattern { id: string; kind: "connection" | "health" | "routine" | "watch" | "good"; title: string; detail: string; strength: "strong" | "moderate"; numbers: Record<string, number | string> }
const WEEKDAY = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Explainable patterns from her own history. Each needs enough data points to be shown. */
export function findPatterns(elder: Elder, s: DayPoint[], calls: Call[]): Pattern[] {
  const p = pr(elder);
  const n = elder.preferredName;
  const out: Pattern[] = [];
  const withMood = s.filter((d) => d.mood !== undefined);

  // 1. Family calls lift her mood the next day.
  const after = withMood.filter((d) => s.find((x) => x.date === addDays(d.date, -1))?.familyCall);
  const notAfter = withMood.filter((d) => !after.includes(d));
  if (after.length >= 3 && notAfter.length >= 3) {
    const diff = mean(after.map((d) => d.mood!)) - mean(notAfter.map((d) => d.mood!));
    if (diff >= 0.5) out.push({ id: "family_call_lift", kind: "connection", strength: diff >= 1 ? "strong" : "moderate",
      title: `${n} is happier the day after someone calls`,
      detail: `Mood averages ${r1(mean(after.map((d) => d.mood!)))}/5 the day after a family call, versus ${r1(mean(notAfter.map((d) => d.mood!)))}/5 otherwise (${after.length} vs ${notAfter.length} days).`,
      numbers: { lift: r1(diff), daysAfter: after.length, daysOther: notAfter.length } });
  }

  // 2. Poor sleep pulls mood down.
  const poor = withMood.filter((d) => d.sleep === "poor"), good = withMood.filter((d) => d.sleep === "good");
  if (poor.length >= 2 && good.length >= 3) {
    const diff = mean(good.map((d) => d.mood!)) - mean(poor.map((d) => d.mood!));
    if (diff >= 0.7) out.push({ id: "sleep_mood", kind: "health", strength: diff >= 1.5 ? "strong" : "moderate",
      title: "Bad nights show up in her mood",
      detail: `On days after poor sleep ${p.hers} mood is ${r1(diff)} points lower (${poor.length} poor nights in this period). Worth asking ${p.her} doctor about sleep if it keeps happening.`,
      numbers: { drop: r1(diff), poorNights: poor.length } });
  }

  // 3. Seeing people vs being alone.
  const met = withMood.filter((d) => d.social === "met_people"), alone = withMood.filter((d) => d.social === "alone");
  if (met.length >= 2 && alone.length >= 2) {
    const diff = mean(met.map((d) => d.mood!)) - mean(alone.map((d) => d.mood!));
    if (diff >= 0.7) out.push({ id: "company_mood", kind: "connection", strength: diff >= 1.3 ? "strong" : "moderate",
      title: "Company makes a visible difference",
      detail: `Days ${p.she} meets someone average ${r1(mean(met.map((d) => d.mood!)))}/5; days alone ${r1(mean(alone.map((d) => d.mood!)))}/5.`,
      numbers: { lift: r1(diff) } });
  }

  // 4. Going out and pain the day after (e.g. temple stairs).
  const outDays = s.filter((d) => d.activity === "went_out");
  const nextPain = outDays.map((d) => s.find((x) => x.date === addDays(d.date, 1))?.pain).filter((x): x is number => x !== undefined);
  const otherPain = s.filter((d) => d.pain !== undefined && !outDays.some((o) => addDays(o.date, 1) === d.date)).map((d) => d.pain!);
  if (nextPain.length >= 2 && otherPain.length >= 3 && mean(nextPain) - mean(otherPain) >= 1) out.push({ id: "outing_pain", kind: "health", strength: "moderate",
    title: "Pain rises the day after outings",
    detail: `Pain averages ${r1(mean(nextPain))}/10 the day after ${p.she} goes out, versus ${r1(mean(otherPain))}/10 otherwise. Stairs or long walks may be the trigger.`,
    numbers: { after: r1(mean(nextPain)), other: r1(mean(otherPain)) } });

  // 5. Missed doses cluster on one weekday.
  const misses = s.filter((d) => d.missedDoses > 0);
  if (misses.length >= 2) {
    const byDay = new Map<number, number>();
    for (const d of misses) byDay.set(d.weekday, (byDay.get(d.weekday) ?? 0) + d.missedDoses);
    const [day, count] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = misses.reduce((a, d) => a + d.missedDoses, 0);
    if (count >= 2 && count / total >= 0.5) out.push({ id: "weekday_misses", kind: "routine", strength: count / total >= 0.75 ? "strong" : "moderate",
      title: `Missed doses happen mostly on ${WEEKDAY[day]}`,
      detail: `${count} of ${total} missed doses fell on ${WEEKDAY[day]}. A change in routine that day (outings, visitors) may be why.`,
      numbers: { weekday: WEEKDAY[day], count, total } });
  }

  // 6. Pain trend.
  const painSeries = s.slice(-14).filter((d) => d.pain !== undefined).map((d) => d.pain!);
  if (painSeries.length >= 6) {
    const perWeek = slope(painSeries) * 7;
    if (perWeek <= -0.8) out.push({ id: "pain_easing", kind: "good", strength: perWeek <= -1.5 ? "strong" : "moderate", title: "Pain is steadily easing", detail: `Down about ${r1(-perWeek)} points a week over the last two weeks (${painSeries[0]}/10 → ${painSeries.at(-1)}/10).`, numbers: { perWeek: r1(perWeek) } });
    if (perWeek >= 0.8) out.push({ id: "pain_rising", kind: "watch", strength: perWeek >= 1.5 ? "strong" : "moderate", title: "Pain is creeping up", detail: `Up about ${r1(perWeek)} points a week (${painSeries[0]}/10 → ${painSeries.at(-1)}/10). Worth mentioning at ${p.hers} next doctor visit.`, numbers: { perWeek: r1(perWeek) } });
  }

  // 7. Alone for several days.
  let streak = 0;
  for (const d of [...s].reverse()) { if (d.social === "alone") streak++; else if (d.social) break; }
  if (streak >= 3) out.push({ id: "alone_streak", kind: "watch", strength: streak >= 5 ? "strong" : "moderate", title: `${streak} days without seeing anyone`, detail: `${n} hasn't met anyone in person for ${streak} days. A visit or a neighbour dropping by would help.`, numbers: { days: streak } });

  // 8. Voice vitality: slower speech or longer pauses than her usual.
  const v = calls.filter((c) => c.voice && c.status === "completed").sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  if (v.length >= 4) {
    const last = v.at(-1)!.voice!, base = v.slice(0, -1).slice(-10);
    const wpm0 = median(base.map((c) => c.voice!.wpm)), gap0 = median(base.map((c) => c.voice!.replyGapSec));
    if (last.wpm < wpm0 * 0.8 || last.replyGapSec > gap0 * 1.5) out.push({ id: "voice_change", kind: "watch", strength: "moderate",
      title: "Speaking slower than usual today",
      detail: `${last.wpm} words/min vs ${p.hers} usual ${Math.round(wpm0)}, replies after ${r1(last.replyGapSec)}s vs ${r1(gap0)}s. Often just tiredness; worth noting if it continues for several days.`,
      numbers: { wpm: last.wpm, usualWpm: Math.round(wpm0) } });
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1));
}

export async function wellbeingReport(elder: Elder, days = 30, today = localDate(elder.tz)) {
  const repo = getRepo();
  const series = await wellbeingSeries(elder, days, today);
  const calls = await repo.listCalls(elder.elderId);
  const indexed = series.filter((d) => d.index !== null);
  const baseDays = indexed.filter((d) => d.date <= addDays(today, -3));
  const base = { mean: Math.round(mean(baseDays.map((d) => d.index!))), sd: r1(sd(baseDays.map((d) => d.index!))), n: baseDays.length };
  const latest = indexed.at(-1);
  const delta = latest && base.n >= 5 ? latest.index! - base.mean : 0;
  const z = base.sd ? delta / base.sd : 0;
  const status = !latest || base.n < 5 ? "learning" : z <= -2 ? "well_below" : z <= -1 ? "below" : z >= 1 ? "better" : "usual";

  const avgDim = (pts: DayPoint[], d: Dim) => { const xs = pts.map((x) => x.dims[d]).filter((x): x is number => x !== undefined); return xs.length ? Math.round(mean(xs)) : null; };
  const last7 = series.slice(-7), prev7 = series.slice(-14, -7);
  const dims = DIMS.map((d) => ({ dim: d, label: DIM_LABEL[d], now: avgDim(last7, d), before: avgDim(prev7, d) }))
    .map((x) => ({ ...x, change: x.now !== null && x.before !== null ? x.now - x.before : null }));
  const lastVoice = calls.filter((c) => c.voice).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0]?.voice ?? null;

  return {
    today: latest ? { date: latest.date, index: latest.index, dims: latest.dims, highlight: latest.highlight } : null,
    baseline: base, delta, status,
    dims,
    patterns: findPatterns(elder, series, calls),
    voice: lastVoice,
    series: series.map((d) => ({ date: d.date, index: d.index, mood: d.mood ?? null, pain: d.pain ?? null, familyCall: d.familyCall, social: d.social ?? null, activity: d.activity ?? null, highlight: d.highlight ?? null })),
    highlights: series.filter((d) => d.highlight).slice(-5).map((d) => ({ date: d.date, text: d.highlight! })),
  };
}

// ---------- the human conversation: what to talk about today ----------
const BANK: Record<"food" | "people" | "moving" | "joy" | "rest", string[]> = {
  food: ["What did she cook or eat today? (appetite)", "Did she have a proper lunch, or just tea and biscuits? (appetite)", "What's for dinner tonight? (appetite)"],
  people: ["Did anyone drop by, or did she talk to anyone today? (social)", "Has she been to the temple or the market lately? Who did she meet? (social)", "Has she spoken to her friends or neighbours this week? (social)"],
  moving: ["Did she step outside today, a walk or the terrace? (activity)", "What did she do this morning? (activity)", "Is she getting time in the garden or for a short walk? (activity)"],
  joy: ["Did anything make her smile today? (highlight)", "Is she watching anything nice on TV these days? (highlight)", "Any good news from relatives or friends? (highlight)"],
  rest: ["Did she sleep through the night, or wake up often? (sleep)", "Is she getting an afternoon rest? (sleep)"],
};

/** 3 natural topics for today (rotating) + personal hooks from her own memories. */
export async function conversationPlan(elder: Elder, today = localDate(elder.tz)): Promise<string> {
  const doy = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${today.slice(0, 4)}-01-01T00:00:00Z`)) / 86400_000);
  const pick = (k: keyof typeof BANK, salt = 0) => BANK[k][(doy + salt) % BANK[k].length];
  const topics = [pick("food"), doy % 2 ? pick("people", 1) : pick("moving", 2), doy % 3 === 0 ? pick("rest") : pick("joy", 3)];
  const hooks = (await getRepo().listMemories(elder.elderId))
    .filter((m) => !m.private && (m.type === "preference" || m.type === "person" || m.type === "story"))
    .sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2)
    .map((m) => m.text);
  return [...topics, ...(hooks.length ? [`Something personal to bring up warmly: ${hooks.join("; ")}`] : [])].join(" | ");
}
