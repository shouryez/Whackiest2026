import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { Job, runJob, scheduleJob } from "../src/engine/jobs";
import { pending } from "../src/engine/scheduler";
import { ackAlert } from "../src/packs/kaiseho/alerts";
import { initJobs } from "../src/packs/kaiseho/jobs";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { getRepo } from "../src/repo";

const repo = getRepo();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = (name: keyof typeof AGENT_TOOLS, args: object) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_jobs", ...args }, { actor: "agent" });

beforeAll(async () => { await initJobs(); });
beforeEach(async () => { await seedDemo({ resetEvents: true }); });

describe("scheduled jobs (local backend; EventBridge uses the same Job shapes)", () => {
  it("jobs are plain, validated data (what EventBridge sends to the Lambda)", () => {
    expect(Job.parse({ type: "call", elderId: "e", reason: "reminder", extras: { reminder_text: "plumber" } }).type).toBe("call");
    expect(() => Job.parse({ type: "rm -rf" })).toThrow();
  });

  it("set_reminder schedules a job; running it places the reminder call once", async () => {
    // Reminders are limited to 30 days ahead.
    const when = `${new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)}T18:00`;
    const r = JSON.parse((await tool("set_reminder", { text: "call the plumber", when_local_iso: when })).content[0].text);
    expect(r.ok).toBe(true);
    const rem = (await repo.listReminders(DEMO.elderId))[0];
    expect(pending()).toContain(rem.reminderId);

    const job = { type: "call" as const, elderId: DEMO.elderId, reason: "reminder", extras: { reminder_text: rem.text }, reminderId: rem.reminderId };
    await runJob(job);
    const calls = (await repo.listCalls(DEMO.elderId)).filter((c) => c.reason === "reminder");
    expect(calls).toHaveLength(1);
    expect((await repo.listReminders(DEMO.elderId))[0].status).toBe("done");
    await runJob(job); // EventBridge may deliver twice: must not call twice
    expect((await repo.listCalls(DEMO.elderId)).filter((c) => c.reason === "reminder")).toHaveLength(1);
  });

  it("emergency repeats stop once someone acknowledges", async () => {
    await tool("raise_emergency", { kind: "fall", details: "I fell in the bathroom" });
    const first = (await repo.listAlerts(DEMO.familyId)).find((a) => a.type === "emergency")!;
    await runJob({ type: "emergency_repeat", alertId: first.alertId, n: 1 });
    expect((await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "emergency")).toHaveLength(2);
    await ackAlert(first.alertId, "family:mem_ravi");
    await runJob({ type: "emergency_repeat", alertId: first.alertId, n: 2 });
    expect((await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "emergency")).toHaveLength(2);
  });

  it("a daily job respects the elder's pause and consent", async () => {
    const e = (await repo.getElder(DEMO.elderId))!;
    e.status = "paused"; e.pausedUntil = "2099-01-01"; await repo.putElder(e);
    await runJob({ type: "call", elderId: DEMO.elderId, reason: "daily" });
    expect((await repo.listCalls(DEMO.elderId)).filter((c) => c.status === "ringing")).toHaveLength(0);
    e.status = "active"; e.pausedUntil = undefined; await repo.putElder(e);
    await runJob({ type: "call", elderId: DEMO.elderId, reason: "daily" });
    expect((await repo.listCalls(DEMO.elderId)).filter((c) => c.status === "ringing")).toHaveLength(1);
  });

  it("scheduleJob falls back to local timers without EventBridge config", async () => {
    expect(await scheduleJob("t-local", new Date(Date.now() + 3600_000), { type: "digest", elderId: DEMO.elderId })).toBe("local");
  });
});
