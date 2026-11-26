import type { Elder, LifeCertStatus } from "@kaiseho/shared";
import { addDays, localDate, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";

/**
 * Pension life-certificate reminder (plan.md P2-9). Pensioners must submit an annual life certificate
 * (Jeevan Pramaan) in November; pensioners aged 80+ can submit from 1 October. If it's missed,
 * the pension can be paused until it is submitted. KaiseHo asks once, gently, while the window is open,
 * and gives the family a checklist when she needs help. It never asks for Aadhaar, PPO or bank numbers.
 */
export const LIFE_CERT_CHECKLIST = [
  "Ways to submit: at the bank or post office where the pension comes, by face authentication on a phone (Jeevan Pramaan + AadhaarFaceRD apps), or a doorstep visit (bank doorstep service / India Post Payments Bank).",
  "Keep ready: Aadhaar card, PPO number, pension bank passbook and the mobile number linked to Aadhaar.",
  "Banks never call to 'update' a life certificate or ask for an OTP. Any such call is a scam.",
];

export function lifeCertWindow(elder: Pick<Elder, "age" | "tz">, today = localDate(elder.tz)) {
  const year = Number(today.slice(0, 4));
  const superSenior = (elder.age ?? 0) >= 80;
  const start = `${year}-${superSenior ? "10" : "11"}-01`;
  const end = `${year}-11-30`;
  const open = today >= start && today <= end;
  const daysLeft = Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000));
  return { year, start, end, open, daysLeft, superSenior };
}

/** This year's status (a certificate from last year doesn't count). */
export function lifeCertStatus(elder: Elder, today = localDate(elder.tz)) {
  const w = lifeCertWindow(elder, today);
  const lc = elder.pension?.lifeCert;
  const status: LifeCertStatus = lc && lc.year === w.year ? lc.status : "pending";
  return { applicable: Boolean(elder.pension?.pensioner), status, method: lc?.year === w.year ? lc.method : undefined, askedOn: lc?.year === w.year ? lc.askedOn : undefined, disbursedBy: elder.pension?.disbursedBy, window: w, checklist: LIFE_CERT_CHECKLIST };
}

/** Dynamic variable for the caller: ask at most every 3 days while the window is open and it isn't done. */
export function pensionNote(elder: Elder, family: string, today = localDate(elder.tz)): string {
  const s = lifeCertStatus(elder, today);
  if (!s.applicable || !s.window.open || s.status === "done") return "none";
  if (s.askedOn && s.askedOn > addDays(today, -3)) return "none";
  const left = s.window.daysLeft === 0 ? "today is the last day" : `${s.window.daysLeft} day${s.window.daysLeft === 1 ? "" : "s"} left`;
  return `Her yearly pension life certificate (Jeevan Pramaan) is due by 30 November (${left})${s.disbursedBy ? `; the pension comes through ${s.disbursedBy}` : ""}. Ask once, gently, whether it's done, then call log_life_certificate. If not, offer to ask ${family} to help. Never ask for Aadhaar, PPO or bank numbers.`;
}

export async function logLifeCert(elder: Elder, status: Exclude<LifeCertStatus, "pending">, by: string, method?: string) {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const w = lifeCertWindow(elder, today);
  const prev = elder.pension?.lifeCert;
  elder.pension = {
    ...(elder.pension ?? { pensioner: true }),
    lifeCert: { year: w.year, status, method: method?.slice(0, 60), updatedAt: nowIso(), askedOn: by === "elder" ? today : prev?.year === w.year ? prev.askedOn : undefined },
  };
  await repo.putElder(elder);
  if (prev?.year === w.year && prev.status === status) return elder.pension;

  const p = pr(elder);
  const left = w.open ? ` ${w.daysLeft === 0 ? "Today is the last day." : `${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left (due 30 Nov).`}` : "";
  if (status === "done") {
    await createAlert({ elder, severity: "info", type: "pension", title: `${elder.preferredName}'s life certificate is submitted ✓`,
      body: `${elder.preferredName} ${by === "elder" ? "told KaiseHo" : "is marked as having"} submitted this year's pension life certificate${method ? ` (${method})` : ""}. Nothing more to do until next November.`,
      data: { status, by } });
  } else if (by === "elder") {
    await createAlert({ elder, severity: "watch", type: "pension",
      title: status === "needs_help" ? `${elder.preferredName} needs help with ${p.hers} life certificate` : `${elder.preferredName}'s life certificate isn't done yet`,
      body: `${elder.preferredName} said ${status === "needs_help" ? `${p.she} needs help submitting` : `${p.she} hasn't submitted`} this year's pension life certificate (Jeevan Pramaan).${left}`,
      data: { status, by }, telegramLines: LIFE_CERT_CHECKLIST.map((l) => `• ${l}`) });
  }
  return elder.pension;
}
