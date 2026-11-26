import type { Call, Elder } from "@kaiseho/shared";
import { env } from "../../env";
import { startCall } from "../../engine/calls";
import { emit } from "../../engine/events";
import { localDate, nowIso } from "../../engine/ids";
import { every } from "../../engine/scheduler";
import { scheduleJob } from "../../engine/jobs";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { buildContext } from "./context";

/**
 * KaiseHo call flows on top of the Ek Call engine: check-ins, reminder/callback calls,
 * and the no-answer ladder (plan.md Section 8.4).
 */
export async function callElder(elder: Elder, reason: string, extras: Record<string, string> = {}, attempt = 1, opts: { simulated?: boolean } = {}) {
  // Consent first: until the elder says yes, the only call allowed is the consent (welcome) call.
  if (elder.status === "pending_consent" && reason !== "consent") throw new Error(`${elder.preferredName} hasn't consented yet: make the welcome call first`);
  if ((elder.status === "paused" || elder.status === "stopped") && reason === "daily") throw new Error(`calls are ${elder.status} for ${elder.preferredName}`);
  return startCall({
    elder, reason, extras, attempt, buildContext, forceSimulated: opts.simulated,
    onFailure: (call) => onNoAnswer(elder, call),
  });
}

/** No-answer ladder: retry after RETRY_MINUTES, then an urgent family alert. */
export async function onNoAnswer(elder: Elder, call: Call): Promise<void> {
  const repo = getRepo();
  call.status = "no_answer";
  call.endedAt = call.endedAt ?? nowIso();
  await repo.putCall(call);
  emit("call.ended", elder.familyId, { callId: call.callId, status: "no_answer", attempt: call.attempt }, elder.elderId);

  if (call.attempt < 2) {
    const when = new Date(Date.now() + env.RETRY_MINUTES * 60_000);
    await scheduleJob(`retry-${elder.elderId}-${call.callId}`, when, { type: "call", elderId: elder.elderId, reason: call.reason, attempt: call.attempt + 1 });
    emit("call.scheduled", elder.familyId, { reason: call.reason, at: when.toISOString(), attempt: call.attempt + 1, retry: true }, elder.elderId);
    return;
  }
  const calls = await repo.listCalls(elder.elderId);
  const lastOk = calls.find((c) => c.status === "completed" && c.summary);
  const times = calls.filter((c) => c.status === "no_answer" && c.startedAt && c.startedAt.slice(0, 10) === nowIso().slice(0, 10))
    .map((c) => new Date(c.startedAt!).toLocaleTimeString("en-IN", { timeZone: elder.tz, hour: "numeric", minute: "2-digit" }));
  await createAlert({
    elder, severity: "urgent", type: "no_answer",
    title: `${elder.preferredName} didn't pick up twice`,
    body: `${elder.preferredName} didn't answer KaiseHo's call twice today (${times.join(", ") || "this morning"}). Last call: ${lastOk?.summary?.family_en.split(". ")[0] ?? "no recent summary"}.`,
    data: { callId: call.callId },
    telegramLines: ["👉 Could you give her a call, or ask Kamala aunty to check in?"],
  });
}

/** Daily check-in ticker: places today's call at the elder's chosen local time (when enabled). */
export function startDailyTicker(): void {
  if (!env.ENABLE_DAILY_CALLS) return;
  every("daily-ticker", 60_000, async () => {
    const repo = getRepo();
    // Every elder in every family, each in their own timezone and at their own time (P2-12).
    for (const elder of await repo.listAllElders()) {
      if (elder.status === "paused" && elder.pausedUntil && elder.pausedUntil <= localDate(elder.tz)) {
        elder.status = "active"; elder.pausedUntil = undefined; await repo.putElder(elder);
      }
      if (elder.status !== "active") continue;
      const now = new Intl.DateTimeFormat("en-GB", { timeZone: elder.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      const dow = new Date(`${localDate(elder.tz)}T00:00:00Z`).getUTCDay();
      if (now !== elder.callTimeLocal || !elder.callDays.includes(dow)) continue;
      const today = localDate(elder.tz);
      const already = (await repo.listCalls(elder.elderId)).some((c) => c.reason === "daily" && c.startedAt && localDate(elder.tz, new Date(c.startedAt)) === today);
      if (!already) await callElder(elder, "daily");
    }
  });
}
