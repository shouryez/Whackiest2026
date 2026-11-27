import type { Elder, Vital, VitalKind, VitalTargets } from "@kaiseho/shared";
import { ToolRejected } from "../../control/tiers";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";

/**
 * Home readings by voice: "my sugar was 140 this morning", "BP 150 by 90". Logged against HER doctor's
 * ranges (general adult defaults until the family sets them), charted, and summarised in the doctor brief.
 * KaiseHo never interprets a reading medically: out of range → "please tell your doctor"; dangerous
 * values with symptoms → the emergency path.
 */
export const DEFAULT_TARGETS: VitalTargets = { sugarFasting: [70, 130], sugarAfterFood: [70, 180], bpSystolic: [90, 140], bpDiastolic: [60, 90], spo2Min: 94 };
export const UNIT: Record<VitalKind, string> = { sugar: "mg/dL", bp: "mmHg", weight: "kg", spo2: "%", temperature: "°F" };
const LABEL: Record<VitalKind, string> = { sugar: "Sugar", bp: "BP", weight: "Weight", spo2: "Oxygen", temperature: "Temperature" };

export const targetsFor = (elder: Elder): VitalTargets => ({ ...DEFAULT_TARGETS, ...(elder.vitalTargets ?? {}) });

export function classify(kind: VitalKind, value: number, value2: number | undefined, context: Vital["context"], t: VitalTargets): Vital["status"] {
  if (kind === "sugar") {
    if (value < 54) return "very_low";
    if (value < t.sugarFasting[0]) return "low";
    if (value >= 300) return "very_high";
    const max = context === "fasting" || context === "morning" ? t.sugarFasting[1] : t.sugarAfterFood[1];
    return value > max ? "high" : "normal";
  }
  if (kind === "bp") {
    const dia = value2 ?? 0;
    if (value >= 180 || dia >= 120) return "very_high";
    if (value < 80) return "very_low";
    if (value > t.bpSystolic[1] || dia > t.bpDiastolic[1]) return "high";
    if (value < t.bpSystolic[0] || (dia && dia < t.bpDiastolic[0])) return "low";
    return "normal";
  }
  if (kind === "spo2") return value < 90 ? "very_low" : value < t.spo2Min ? "low" : "normal";
  if (kind === "temperature") { const f = value < 50 ? value * 1.8 + 32 : value; return f >= 103 ? "very_high" : f >= 100.4 ? "high" : "normal"; }
  return "normal";
}

export const fmtVital = (v: Pick<Vital, "kind" | "value" | "value2" | "unit" | "context">) =>
  `${LABEL[v.kind]} ${v.kind === "bp" ? `${v.value}/${v.value2 ?? "?"}` : v.value}${v.kind === "spo2" ? "%" : ` ${v.unit}`}${v.context && v.context !== "random" ? ` (${v.context.replace("_", " ")})` : ""}`;

export async function logVital(elder: Elder, input: { kind: VitalKind; value: number; value2?: number; context?: Vital["context"]; source: Vital["source"]; callId?: string }) {
  const repo = getRepo();
  const plausible: Record<VitalKind, [number, number]> = { sugar: [20, 700], bp: [50, 260], weight: [20, 250], spo2: [50, 100], temperature: [30, 110] };
  const [lo, hi] = plausible[input.kind];
  if (input.value < lo || input.value > hi || (input.kind === "bp" && (!input.value2 || input.value2 < 30 || input.value2 > 160))) {
    throw new ToolRejected("that reading doesn't look right", "gently ask her to read the number again from the machine");
  }
  const status = classify(input.kind, input.value, input.value2, input.context, targetsFor(elder));
  const v: Vital = {
    elderId: elder.elderId, vitalId: newId("vit"), kind: input.kind, value: input.value, value2: input.kind === "bp" ? input.value2 : undefined,
    unit: UNIT[input.kind], context: input.context, date: localDate(elder.tz), measuredAt: nowIso(), status, source: input.source, callId: input.callId,
  };
  await repo.putVital(v);
  emit("vital.logged", elder.familyId, { vital: v, label: `🩸 ${fmtVital(v)}${status === "normal" ? " ✓" : ` · ${status.replace("_", " ")}`}` }, elder.elderId);

  if (status !== "normal") {
    const p = pr(elder);
    const danger = status === "very_high" || status === "very_low";
    const sameToday = (await repo.listAlerts(elder.familyId)).some((a) => a.type === "vital" && a.elderId === elder.elderId && (a.data as { kind?: string }).kind === v.kind && localDate(elder.tz, new Date(a.createdAt)) === v.date && !danger);
    if (danger || !sameToday) {
      await createAlert({
        elder, severity: danger ? "urgent" : "watch", type: "vital",
        title: `${elder.preferredName}'s ${fmtVital(v)} is ${status.replace("_", " ")}`,
        body: `${elder.preferredName} told KaiseHo ${p.hers} reading today. ${danger ? `That's well outside the usual range: please call ${p.her} now and contact ${p.hers} doctor.` : `Above ${p.hers} target range; worth mentioning to ${p.hers} doctor if it repeats.`}`,
        data: { kind: v.kind, value: v.value, value2: v.value2, status, vitalId: v.vitalId },
        telegramLines: danger ? ["👉 Call her now. If she feels dizzy, breathless or has chest pain: 112."] : [],
      });
    }
  }
  const say = status === "normal" ? "Acknowledge warmly; that's within her usual range."
    : status === "very_high" || status === "very_low"
      ? "Stay calm. Ask how she feels right now. If she is dizzy, confused, breathless, has chest pain or feels faint, call raise_emergency. Otherwise say her family is being told and she should call her doctor today. Never suggest medicines or doses."
      : "Note it calmly without alarming her. Suggest she mentions it to her doctor if it stays high. Never suggest medicines or doses.";
  return { ok: true, status, reading: fmtVital(v), say };
}

export async function vitalsSummary(elder: Elder, days = 30) {
  const since = addDays(localDate(elder.tz), -(days - 1));
  const all = await getRepo().listVitals(elder.elderId, since);
  const kinds = [...new Set(all.map((v) => v.kind))];
  return {
    targets: targetsFor(elder),
    tracked: elder.vitalsTracked ?? [],
    kinds: kinds.map((kind) => {
      const xs = all.filter((v) => v.kind === kind);
      const vals = xs.map((v) => v.value);
      return {
        kind, label: LABEL[kind], unit: UNIT[kind], count: xs.length,
        latest: xs.at(-1) ? { ...xs.at(-1)!, text: fmtVital(xs.at(-1)!) } : null,
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        avg2: kind === "bp" ? Math.round(xs.reduce((a, v) => a + (v.value2 ?? 0), 0) / xs.length) : undefined,
        min: Math.min(...vals), max: Math.max(...vals),
        outOfRange: xs.filter((v) => v.status !== "normal").length,
        series: xs.map((v) => ({ date: v.date, at: v.measuredAt, value: v.value, value2: v.value2, context: v.context, status: v.status })),
      };
    }),
  };
}

/** Dynamic variable: which readings to ask for (only if she tracks them, never pushy). */
export async function vitalsNote(elder: Elder): Promise<string> {
  const tracked = elder.vitalsTracked ?? [];
  if (!tracked.length) return "none";
  const recent = (await getRepo().listVitals(elder.elderId, addDays(localDate(elder.tz), -7))).reverse();
  const last = tracked.map((k) => recent.find((v) => v.kind === k)).filter(Boolean).map((v) => `${fmtVital(v!)} on ${v!.date.slice(5)}`);
  const words = tracked.map((k) => (k === "sugar" ? "sugar" : k === "bp" ? "BP" : LABEL[k].toLowerCase()));
  return `She checks her ${words.join(" and ")} at home. If she checked today, ask the reading casually and call log_vital (for BP: both numbers). Don't push if she hasn't.${last.length ? ` Last readings: ${last.join("; ")}.` : ""}`;
}
