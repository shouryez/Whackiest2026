import type { Elder, Reminder } from "@kaiseho/shared";
import { ToolRejected } from "../../control/tiers";
import { redactPII } from "../../control/redact";
import { emit } from "../../engine/events";
import { newId, nowIso } from "../../engine/ids";
import { cancelJob, scheduleJob } from "../../engine/jobs";
import { getRepo } from "../../repo";

/**
 * Reminder and callback calls (plan.md P2-11). The elder asks by voice ("remind me at 6 to call the plumber"),
 * or the family sets one from the dashboard / Claude. Either way it is a short call at that time,
 * and anyone in the family can see and cancel it.
 */
export const MAX_UPCOMING = 5;

function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-12-01T18:00" in the elder's timezone → a UTC instant. */
export function localToUtc(localIso: string, tz: string): Date {
  const guess = new Date(`${localIso.slice(0, 19)}Z`);
  if (Number.isNaN(guess.getTime())) throw new ToolRejected("could not understand the time", "ask for the time again, e.g. 6 PM today");
  return new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60000);
}

/** "today at 6:00 pm" / "tomorrow at 9:30 am" / "Saturday at 6:00 pm". */
export function spokenWhen(d: Date, tz: string, now = new Date()): string {
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const label = day(d) === day(now) ? "today" : day(d) === day(new Date(now.getTime() + 86400_000)) ? "tomorrow" : new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(d);
  return `${label} at ${new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d)}`;
}

export async function upcomingReminders(elder: Elder): Promise<(Reminder & { whenSpoken: string })[]> {
  const now = Date.now() - 60_000;
  return (await getRepo().listReminders(elder.elderId))
    .filter((r) => r.status === "scheduled" && new Date(r.whenUtc).getTime() >= now)
    .sort((a, b) => a.whenUtc.localeCompare(b.whenUtc))
    .map((r) => ({ ...r, whenSpoken: spokenWhen(new Date(r.whenUtc), elder.tz) }));
}

export async function createReminder(elder: Elder, input: { kind: "reminder" | "callback"; text: string; when: Date; createdBy: string }): Promise<Reminder & { whenSpoken: string }> {
  if (input.when.getTime() < Date.now() - 60_000) throw new ToolRejected("that time has passed", "ask for a time later today or tomorrow");
  if (input.when.getTime() > Date.now() + 30 * 86400_000) throw new ToolRejected("too far ahead", "reminders can be up to 30 days ahead");
  if ((await upcomingReminders(elder)).length >= MAX_UPCOMING) throw new ToolRejected(`already ${MAX_UPCOMING} reminders waiting`, "ask the family to cancel one first");
  const reminder: Reminder = {
    elderId: elder.elderId, reminderId: newId(input.kind === "callback" ? "cb" : "rem"), kind: input.kind,
    text: input.kind === "callback" ? "callback" : redactPII(input.text).slice(0, 200), whenUtc: input.when.toISOString(),
    status: "scheduled", createdAt: nowIso(), createdBy: input.createdBy,
  };
  await getRepo().putReminder(reminder);
  await scheduleJob(reminder.reminderId, input.when, {
    type: "call", elderId: elder.elderId, reason: input.kind, reminderId: reminder.reminderId,
    ...(input.kind === "reminder" ? { extras: { reminder_text: reminder.text } } : {}),
  });
  emit("call.scheduled", elder.familyId, { reason: input.kind, at: reminder.whenUtc, text: reminder.text, reminderId: reminder.reminderId, by: input.createdBy }, elder.elderId);
  return { ...reminder, whenSpoken: spokenWhen(input.when, elder.tz) };
}

export async function cancelReminder(elder: Elder, reminderId: string, by: string): Promise<Reminder> {
  const repo = getRepo();
  const r = (await repo.listReminders(elder.elderId)).find((x) => x.reminderId === reminderId);
  if (!r) throw Object.assign(new ToolRejected("unknown reminder"), { status: 404 });
  if (r.status !== "scheduled") return r;
  r.status = "cancelled";
  await repo.putReminder(r);
  await cancelJob(reminderId).catch(() => {});
  emit("schedule.updated", elder.familyId, { reminderId, cancelled: true, by }, elder.elderId);
  return r;
}
