import { z } from "zod";
import type { Elder } from "@kaiseho/shared";
import { localDate } from "../../engine/ids";
import { llmJson } from "../../engine/llm";
import { getRepo } from "../../repo";
import { gasStatus } from "./needs";
import { pr } from "./pronouns";
import { callRota } from "./rota";
import { vitalsSummary } from "./vitals";
import { wellbeingReport, type Pattern } from "./wellbeing";

/**
 * "What should I know, and what should I do?" Gemini turns the computed numbers (never raw transcripts)
 * into at most 4 kind, specific suggestions for the family. Grounded: the model only sees statistics
 * already shown on the dashboard. Deterministic cards when no AI key is set. Cached per day.
 */
const CardSchema = z.object({
  cards: z.array(z.object({
    kind: z.enum(["celebrate", "pattern", "watch", "action"]),
    title: z.string().max(80),
    insight: z.string().max(260),
    suggestion: z.string().max(200),
  })).min(1).max(4),
});
export type InsightCard = z.infer<typeof CardSchema>["cards"][number];

const cache = new Map<string, { key: string; out: { cards: InsightCard[]; source: "llm" | "rules"; generatedAt: string } }>();

function fromPattern(elder: Elder, p: Pattern, nextUp?: string | null): InsightCard {
  const her = pr(elder).her;
  const s: Record<string, string> = {
    family_call_lift: `${nextUp ? `${nextUp}, it's your turn: ` : ""}a 5-minute call tonight will likely lift tomorrow.`,
    sleep_mood: `Ask ${her} gently about sleep tonight; note it for the doctor brief if it continues.`,
    company_mood: `Ask a neighbour or friend to drop by, or plan a visit this weekend.`,
    outing_pain: `Suggest ${her} rests the day after outings, or takes the lift/railing at the temple.`,
    weekday_misses: `Leave a message for that morning: KaiseHo will remind ${her} by name.`,
    pain_easing: `Tell ${her} you noticed: it's motivating to hear it's getting better.`,
    pain_rising: `Book a follow-up: KaiseHo can call the clinic for you.`,
    alone_streak: `Plan a visit, or ask a neighbour to look in on ${her} today.`,
    voice_change: `Call ${her} today and listen; if it continues for several days, mention it to ${her} doctor.`,
  };
  return { kind: p.kind === "good" ? "celebrate" : p.kind === "watch" ? "watch" : "pattern", title: p.title, insight: p.detail, suggestion: s[p.id] ?? "Give her a call this week." };
}

export async function insightCards(elder: Elder, opts: { fresh?: boolean } = {}) {
  const today = localDate(elder.tz);
  const report = await wellbeingReport(elder, 30, today);
  const vitals = await vitalsSummary(elder, 30);
  const rota = await callRota(elder);
  const needs = (await getRepo().listNeeds(elder.elderId)).filter((n) => n.status !== "done");
  const key = `${today}|${report.series.filter((d) => d.index !== null).length}|${report.patterns.map((p) => p.id).join(",")}|${vitals.kinds.map((k) => k.count).join(",")}|${needs.length}|${rota.thisWeekTotal}`;
  const hit = cache.get(elder.elderId);
  if (hit && hit.key === key && !opts.fresh) return hit.out;

  const facts = {
    name: elder.preferredName, pronoun: pr(elder).she, age: elder.age, conditions: elder.conditions,
    wellbeing_index_today_out_of_100: report.today?.index ?? null, her_usual_index_out_of_100: report.baseline.mean, status_vs_her_usual: report.status,
    // Scores are 0-100 (100 = best). "Comfort" = absence of pain. Mood in patterns is on a 1-5 scale.
    dimension_scores_0_to_100_last7_vs_prev7: report.dims.map((d) => ({ dim: d.label, now_score_out_of_100: d.now, prev_week_score_out_of_100: d.before })),
    patterns: report.patterns.map((p) => ({ title: p.title, detail: p.detail, strength: p.strength })),
    recent_good_moments: report.highlights.map((h) => h.text),
    vitals: vitals.kinds.map((k) => ({ kind: k.label, latest: k.latest?.text, avg: k.avg, out_of_range: k.outOfRange, readings: k.count })),
    family_calls: { this_week: rota.thisWeekTotal, per_person: rota.members.map((m) => ({ name: m.name, this_week: m.thisWeek, days_since: m.daysSince })), next_up: rota.nextUp?.name },
    open_needs: needs.map((n) => `${n.item} (${n.status}${n.claimedBy ? ` by ${n.claimedBy}` : ""})`),
    gas: gasStatus(elder, today),
  };
  const llm = await llmJson({
    system: `You are KaiseHo's family care analyst. Turn the numbers about an elderly Indian parent into at most 4 short cards for their adult children.
Rules: use ONLY the facts given; never invent numbers; keep every number on the scale it is given in (scores "out of 100" stay out of 100, mood "/5" stays /5); never diagnose or suggest medicines/doses; for health concerns say "worth mentioning to the doctor".
Each card: kind (celebrate | pattern | watch | action), title (<= 8 words, warm, specific), insight (one or two sentences citing the actual numbers),
suggestion (one concrete, kind action for a named family member when possible: when to call, what to talk about, who should visit, what to arrange).
Lead with the most useful card. Include at least one "celebrate" card if anything is going well. Return JSON {cards:[...]}.`,
    user: JSON.stringify(facts),
    schema: CardSchema,
    timeoutMs: 12000,
  });
  const cards = llm?.cards ?? [
    ...report.patterns.slice(0, 3).map((p) => fromPattern(elder, p, rota.nextUp?.name)),
    ...(report.highlights.length ? [{ kind: "celebrate" as const, title: "A good moment this week", insight: `${elder.preferredName} shared: "${report.highlights.at(-1)!.text}".`, suggestion: "Bring it up when you call: it shows you were listening." }] : []),
  ].slice(0, 4);
  const out = { cards: cards.length ? cards : [{ kind: "action" as const, title: "Keep the calls going", insight: "Not enough history yet to spot patterns.", suggestion: "Patterns appear after about a week of check-ins." }], source: (llm ? "llm" : "rules") as "llm" | "rules", generatedAt: new Date().toISOString() };
  cache.set(elder.elderId, { key, out });
  return out;
}
