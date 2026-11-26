import type { Elder, Medication } from "@kaiseho/shared";
import { addDays, localDate } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";
import { filterForFamily } from "./views";

/**
 * Phase 5 (plan.md P2-3, P2-4, P2-5, P2-7): refill prediction, change detection,
 * doctor brief and scam "vaccine" drills. Deterministic and explainable: KaiseHo notices
 * and suggests "worth discussing with her doctor"; it never diagnoses.
 */

// ---------- P2-3 refill prediction ----------
export function refillFor(m: Medication): { medId: string; name: string; stock: number; perDay: number; daysLeft: number; runsOut: string } | null {
  if (typeof m.stockCount !== "number" || !m.active || !m.slots.length) return null;
  const perDay = m.slots.length;
  const daysLeft = Math.floor(m.stockCount / perDay);
  return { medId: m.medId, name: `${m.name} ${m.dose}`, stock: m.stockCount, perDay, daysLeft, runsOut: addDays(new Date().toISOString().slice(0, 10), daysLeft) };
}

export async function refills(elder: Elder) {
  const meds = await getRepo().listMedications(elder.elderId);
  return meds.map(refillFor).filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Called after a dose is logged: one alert per medicine per day once stock is low. */
export async function checkRefill(elder: Elder, med: Medication): Promise<void> {
  const r = refillFor(med);
  if (!r || r.daysLeft > (med.refillThresholdDays ?? 3)) return;
  const repo = getRepo();
  const today = localDate(elder.tz);
  const already = (await repo.listAlerts(elder.familyId)).some((a) => a.type === "refill" && (a.data as { medId?: string }).medId === med.medId && localDate(elder.tz, new Date(a.createdAt)) === today);
  if (already) return;
  await createAlert({
    elder, severity: r.daysLeft <= 2 ? "urgent" : "watch", type: "refill",
    title: `${med.name} runs out in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`,
    body: `${elder.preferredName} has about ${r.stock} ${med.name} ${med.dose} tablets left (${r.perDay} a day). Please arrange a refill before ${r.runsOut}.`,
    data: { medId: med.medId, daysLeft: r.daysLeft, stock: r.stock },
    telegramLines: ["💊 Order a refill or ask the pharmacy to deliver."],
  });
}

// ---------- P2-5 change detection ("Mirror lite") ----------
export interface Change { metric: "mood" | "pain" | "adherence" | "sleep"; from: number; to: number; text: string }

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export async function detectChanges(elder: Elder): Promise<Change[]> {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const curFrom = addDays(today, -6), prevFrom = addDays(today, -13);
  const checkIns = await repo.listCheckIns(elder.elderId, prevFrom);
  const logs = await repo.listMedLogs(elder.elderId, prevFrom);
  const inCur = (d: string) => d >= curFrom, inPrev = (d: string) => d >= prevFrom && d < curFrom;
  const p = pr(elder);
  const out: Change[] = [];

  const moodC = mean(checkIns.filter((c) => inCur(c.date) && c.mood).map((c) => c.mood!));
  const moodP = mean(checkIns.filter((c) => inPrev(c.date) && c.mood).map((c) => c.mood!));
  if (moodC !== null && moodP !== null && moodP - moodC >= 1) out.push({ metric: "mood", from: +moodP.toFixed(1), to: +moodC.toFixed(1), text: `${p.Her} mood dropped from ${moodP.toFixed(1)} to ${moodC.toFixed(1)} out of 5 this week` });

  const painC = mean(checkIns.filter((c) => inCur(c.date) && c.pain).map((c) => c.pain!.level));
  const painP = mean(checkIns.filter((c) => inPrev(c.date) && c.pain).map((c) => c.pain!.level));
  if (painC !== null && painP !== null && painC - painP >= 2) out.push({ metric: "pain", from: +painP.toFixed(1), to: +painC.toFixed(1), text: `${p.Her} pain rose from ${painP.toFixed(1)} to ${painC.toFixed(1)} out of 10` });

  const adh = (f: (d: string) => boolean) => {
    const l = logs.filter((x) => f(x.date) && x.status !== "unsure");
    return l.length ? (l.filter((x) => x.status === "taken").length / l.length) * 100 : null;
  };
  const aC = adh(inCur), aP = adh(inPrev);
  if (aC !== null && aP !== null && aP - aC >= 20) out.push({ metric: "adherence", from: Math.round(aP), to: Math.round(aC), text: `Medicines taken fell from ${Math.round(aP)}% to ${Math.round(aC)}%` });

  const poorC = checkIns.filter((c) => inCur(c.date) && c.sleep === "poor").length;
  const poorP = checkIns.filter((c) => inPrev(c.date) && c.sleep === "poor").length;
  if (poorC >= 3 && poorC - poorP >= 2) out.push({ metric: "sleep", from: poorP, to: poorC, text: `${p.She} slept poorly on ${poorC} days this week (${poorP} the week before)` });
  return out;
}

/** After each call: one "worth discussing with her doctor" alert per week, never a diagnosis. */
export async function flagChanges(elder: Elder): Promise<Change[]> {
  const changes = await detectChanges(elder);
  if (!changes.length) return changes;
  const repo = getRepo();
  const weekAgo = addDays(localDate(elder.tz), -6);
  const recent = (await repo.listAlerts(elder.familyId)).some((a) => a.type === "health_change" && a.elderId === elder.elderId && (a.data as { weekly?: boolean }).weekly && localDate(elder.tz, new Date(a.createdAt)) >= weekAgo);
  if (recent) return changes;
  await createAlert({
    elder, severity: "watch", type: "health_change",
    title: "A change worth discussing with her doctor",
    body: `${changes.map((c) => c.text).join(". ")}. This isn't a diagnosis, just something to mention at the next doctor visit.`,
    data: { weekly: true, changes },
  });
  return changes;
}

// ---------- P2-4 doctor brief ----------
export async function doctorBrief(elder: Elder, days = 30) {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const since = addDays(today, -(days - 1));
  const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active);
  const logs = await repo.listMedLogs(elder.elderId, since);
  const checkIns = await repo.listCheckIns(elder.elderId, since);
  const { memories } = await filterForFamily(elder);
  const healthNotes = memories.filter((m) => m.type === "health" && m.createdAt.slice(0, 10) >= since).map((m) => ({ date: m.createdAt.slice(0, 10), text: m.text }));
  const alerts = (await repo.listAlerts(elder.familyId)).filter((a) => a.elderId === elder.elderId && a.createdAt.slice(0, 10) >= since && ["emergency", "health_change", "low_mood", "missed_meds"].includes(a.type));

  const perMed = meds.map((m) => {
    const l = logs.filter((x) => x.medId === m.medId && x.status !== "unsure");
    const taken = l.filter((x) => x.status === "taken").length;
    return { name: `${m.name} ${m.dose}`, schedule: m.slots.join(", "), taken, logged: l.length, adherencePct: l.length ? Math.round((taken / l.length) * 100) : null, missedDates: l.filter((x) => x.status === "missed").map((x) => x.date) };
  });
  const moods = checkIns.filter((c) => c.mood).map((c) => c.mood!);
  const pains = checkIns.filter((c) => c.pain);
  const changes = await detectChanges(elder);

  const questions: string[] = [];
  for (const m of perMed) if (m.adherencePct !== null && m.adherencePct < 85) questions.push(`${m.name} is often missed (${m.adherencePct}%). Is there a simpler schedule?`);
  if (pains.length) questions.push(`${pains.at(-1)!.pain!.where} pain, latest ${pains.at(-1)!.pain!.level}/10: what should we watch for?`);
  for (const c of changes) questions.push(`${c.text}: should we be concerned?`);
  for (const n of healthNotes.slice(-3)) questions.push(`She mentioned: "${n.text}"`);
  if (!questions.length) questions.push("Anything to adjust in her current medicines or routine?");

  const upcoming = (await repo.listAppointments(elder.elderId)).filter((a) => a.status === "confirmed" && (a.slotLocalIso ?? "") >= today).sort((a, b) => (a.slotLocalIso ?? "").localeCompare(b.slotLocalIso ?? ""))[0];
  return {
    elder: { name: elder.name, preferredName: elder.preferredName, age: elder.age, city: elder.city, conditions: elder.conditions },
    nextAppointment: upcoming ? { doctor: upcoming.doctor, clinic: upcoming.clinicName, when: upcoming.slotSpoken } : null,
    period: { from: since, to: today, days },
    callsCompleted: (await repo.listCalls(elder.elderId)).filter((c) => c.status === "completed" && (c.startedAt ?? "") >= since).length,
    medicines: perMed,
    mood: { average: moods.length ? +(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null, lowDays: checkIns.filter((c) => (c.mood ?? 5) <= 2).map((c) => c.date) },
    pain: pains.map((c) => ({ date: c.date, where: c.pain!.where, level: c.pain!.level })),
    sleepPoorDays: checkIns.filter((c) => c.sleep === "poor").length,
    changes,
    events: alerts.map((a) => ({ date: a.createdAt.slice(0, 10), type: a.type, title: a.title })),
    healthNotes,
    questionsForDoctor: questions.slice(0, 6),
    disclaimer: "Compiled from short daily check-in calls with her consent. Not a medical record or a diagnosis.",
  };
}

// ---------- P2-7 scam "vaccine" drills ----------
const DRILLS = [
  { id: "cbi_video", q: "If someone says they are CBI or police and asks you to stay on a video call, what do you do?", good: "Hang up. Real police never arrest anyone on a video call. Call family or 1930." },
  { id: "otp_bank", q: "If someone from the 'bank' asks for the OTP that came on your phone, what do you do?", good: "Never share an OTP with anyone, not even the bank. Hang up." },
  { id: "relative_money", q: "If someone calls saying your grandson had an accident and needs money urgently, what do you do?", good: "Don't send money. Call the family member yourself on their usual number first." },
  { id: "kyc_link", q: "If a message says your bank account will be blocked today unless you click a link, what do you do?", good: "Don't click. Banks never block accounts by message. Ask family or visit the branch." },
  { id: "power_cut", q: "If someone says your electricity will be cut tonight unless you pay now, what do you do?", good: "It's a scam. Don't pay. Check the bill with family." },
];

/** A drill once a week (on daily calls only); rotates through the questions. */
export async function nextDrill(elder: Elder): Promise<{ id: string; q: string; good: string } | null> {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const done = (await repo.listCheckIns(elder.elderId, addDays(today, -60))).filter((c) => c.scamDrill);
  if (done.some((c) => c.date >= addDays(today, -6))) return null;
  const asked = new Set(done.map((c) => c.scamDrill!.id));
  return DRILLS.find((d) => !asked.has(d.id)) ?? DRILLS[done.length % DRILLS.length];
}

export async function drillScore(elder: Elder) {
  const drills = (await getRepo().listCheckIns(elder.elderId)).filter((c) => c.scamDrill).map((c) => ({ date: c.date, ...c.scamDrill! }));
  const passed = drills.filter((d) => d.passed).length;
  return { total: drills.length, passed, pct: drills.length ? Math.round((passed / drills.length) * 100) : null, recent: drills.slice(-5).reverse() };
}

export { DRILLS };
