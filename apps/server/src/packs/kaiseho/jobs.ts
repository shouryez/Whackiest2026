import type { Elder, LiveEvent } from "@kaiseho/shared";
import { env } from "../../env";
import { bus } from "../../engine/events";
import { registerJobRunner, upsertDailySchedule, upsertDigestSchedule, type Job } from "../../engine/jobs";
import { getRepo } from "../../repo";
import { callElder } from "./calls";
import { buildDigest } from "./digest";
import { repeatEmergency } from "./emergency";

/** KaiseHo's handlers for scheduled jobs (local timers or EventBridge → Lambda → /internal/jobs/run). */
async function run(job: Job): Promise<void> {
  const repo = getRepo();
  if (job.type === "emergency_repeat") return repeatEmergency(job.alertId, job.n);
  const elder = await repo.getElder(job.elderId);
  if (!elder) return;
  if (job.type === "digest") { await buildDigest(elder); return; }
  if (job.reminderId) {
    const r = (await repo.listReminders(elder.elderId)).find((x) => x.reminderId === job.reminderId);
    if (!r || r.status !== "scheduled") return; // cancelled or already done
    await repo.putReminder({ ...r, status: "done" });
  }
  if (job.reason === "daily") {
    // Respect the elder's own choices at run time (pause / stop / not yet consented).
    if (elder.status === "paused" && elder.pausedUntil && elder.pausedUntil <= new Date().toISOString().slice(0, 10)) {
      elder.status = "active"; elder.pausedUntil = undefined; await repo.putElder(elder);
    }
    if (elder.status !== "active") return;
  }
  await callElder(elder, job.reason, job.extras ?? {}, job.attempt ?? 1);
}

export async function syncSchedules(elder: Elder): Promise<void> {
  await upsertDailySchedule({ elderId: elder.elderId, timeLocal: elder.callTimeLocal, days: elder.callDays, tz: elder.tz, enabled: elder.status === "active" || elder.status === "paused" });
  if (elder.status !== "pending_consent") await upsertDigestSchedule({ elderId: elder.elderId, tz: elder.tz, day: env.DIGEST_DAY, time: env.DIGEST_TIME });
}

export async function initJobs(): Promise<void> {
  registerJobRunner(run);
  if (env.SCHEDULER !== "eventbridge") return;
  // Keep EventBridge schedules in step with the elder's schedule (consent, voice changes, dashboard edits).
  bus.on("event", (ev: LiveEvent) => {
    if (ev.type !== "schedule.updated" || !ev.elderId) return;
    void getRepo().getElder(ev.elderId).then((e) => e && syncSchedules(e)).catch((err) => console.error("[schedules]", err));
  });
  const family = await getRepo().getFamily("fam_lakshmi");
  if (family) for (const e of await getRepo().listEldersByFamily(family.familyId)) await syncSchedules(e).catch((err) => console.error("[schedules]", err));
}
