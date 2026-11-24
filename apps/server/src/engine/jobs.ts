import {
  ActionAfterCompletion, ConflictException, CreateScheduleCommand, DeleteScheduleCommand, FlexibleTimeWindowMode,
  ResourceNotFoundException, SchedulerClient, UpdateScheduleCommand, type CreateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import { z } from "zod";
import { env } from "../env";
import { cancel, scheduleAt } from "./scheduler";

/**
 * Serializable jobs (plan.md Section 16). Locally they run on timers; with SCHEDULER=eventbridge
 * they become EventBridge Scheduler schedules whose target is the job-runner Lambda, which POSTs
 * the job back to /internal/jobs/run. Same code path either way: runJob().
 */
export const Job = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call"), elderId: z.string(), reason: z.string(), extras: z.record(z.string(), z.string()).optional(), attempt: z.number().int().optional(), reminderId: z.string().optional() }),
  z.object({ type: z.literal("emergency_repeat"), alertId: z.string(), n: z.number().int() }),
  z.object({ type: z.literal("digest"), elderId: z.string() }),
]);
export type Job = z.infer<typeof Job>;

type Runner = (job: Job) => Promise<void>;
let runner: Runner = async () => { throw new Error("no job runner registered"); };
export function registerJobRunner(r: Runner): void { runner = r; }
export async function runJob(job: Job): Promise<void> { await runner(Job.parse(job)); }

let client: SchedulerClient | undefined;
const sched = () => (client ??= new SchedulerClient({ region: env.AWS_REGION }));
const useEventBridge = () => env.SCHEDULER === "eventbridge" && env.JOB_RUNNER_LAMBDA_ARN && env.SCHEDULER_ROLE_ARN;
/** Schedule names: [0-9a-zA-Z-_.], max 64 chars. */
const safeName = (id: string) => id.replace(/[^\w.-]/g, "-").slice(0, 64);

function target(job: Job) {
  return { Arn: env.JOB_RUNNER_LAMBDA_ARN!, RoleArn: env.SCHEDULER_ROLE_ARN!, Input: JSON.stringify({ job }) };
}

/** One-time job at a given time (reminders, callbacks, retries, emergency repeats). */
export async function scheduleJob(id: string, when: Date, job: Job): Promise<"eventbridge" | "local"> {
  if (useEventBridge()) {
    // at() takes yyyy-mm-ddThh:mm:ss in the given timezone; we schedule in UTC.
    const at = when.toISOString().slice(0, 19);
    const input: CreateScheduleCommandInput = {
      Name: safeName(id), GroupName: env.SCHEDULER_GROUP, ScheduleExpression: `at(${at})`, ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF }, ActionAfterCompletion: ActionAfterCompletion.DELETE, Target: target(job),
    };
    try {
      await sched().send(new CreateScheduleCommand(input));
    } catch (err) {
      if (err instanceof ConflictException) await sched().send(new UpdateScheduleCommand(input));
      else throw err;
    }
    return "eventbridge";
  }
  scheduleAt(id, when, () => runJob(job));
  return "local";
}

export async function cancelJob(id: string): Promise<void> {
  cancel(id);
  if (useEventBridge()) {
    try { await sched().send(new DeleteScheduleCommand({ Name: safeName(id), GroupName: env.SCHEDULER_GROUP })); }
    catch (err) { if (!(err instanceof ResourceNotFoundException)) throw err; }
  }
}

/**
 * Recurring daily check-in: cron(MM HH ? * DAYS *) in the elder's timezone (e.g. Asia/Kolkata).
 * Locally the daily ticker handles this instead (ENABLE_DAILY_CALLS).
 */
export async function upsertDailySchedule(opts: { elderId: string; timeLocal: string; days: number[]; tz: string; enabled: boolean }): Promise<string | null> {
  if (!useEventBridge()) return null;
  const name = safeName(`daily-${opts.elderId}`);
  if (!opts.enabled) { await cancelJob(name); return null; }
  const [hh, mm] = opts.timeLocal.split(":").map(Number);
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const days = opts.days.length === 7 ? "*" : opts.days.map((d) => DOW[d]).join(",");
  const input: CreateScheduleCommandInput = {
    Name: name, GroupName: env.SCHEDULER_GROUP, ScheduleExpression: `cron(${mm} ${hh} ? * ${days} *)`, ScheduleExpressionTimezone: opts.tz,
    FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF }, Target: target({ type: "call", elderId: opts.elderId, reason: "daily" }),
  };
  try { await sched().send(new CreateScheduleCommand(input)); }
  catch (err) { if (err instanceof ConflictException) await sched().send(new UpdateScheduleCommand(input)); else throw err; }
  return `${input.ScheduleExpression} ${opts.tz}`;
}

/** Weekly digest (Sunday 20:00 local by default). */
export async function upsertDigestSchedule(opts: { elderId: string; tz: string; day: number; time: string }): Promise<string | null> {
  if (!useEventBridge()) return null;
  const [hh, mm] = opts.time.split(":").map(Number);
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const input: CreateScheduleCommandInput = {
    Name: safeName(`digest-${opts.elderId}`), GroupName: env.SCHEDULER_GROUP, ScheduleExpression: `cron(${mm} ${hh} ? * ${DOW[opts.day]} *)`,
    ScheduleExpressionTimezone: opts.tz, FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF }, Target: target({ type: "digest", elderId: opts.elderId }),
  };
  try { await sched().send(new CreateScheduleCommand(input)); }
  catch (err) { if (err instanceof ConflictException) await sched().send(new UpdateScheduleCommand(input)); else throw err; }
  return input.ScheduleExpression!;
}
