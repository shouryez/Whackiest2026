import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { buildContext } from "../src/packs/kaiseho/context";
import { detectChanges, doctorBrief, drillScore, flagChanges, nextDrill, refills } from "../src/packs/kaiseho/health";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { FAMILY_TOOLS } from "../src/packs/kaiseho/tools/familyTools";
import { getRepo } from "../src/repo";

const repo = getRepo();
const elder = async () => (await repo.getElder(DEMO.elderId))!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (name: keyof typeof AGENT_TOOLS, args: object) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_p5", ...args }, { actor: "agent" });

beforeEach(async () => { await seedDemo({ resetEvents: true }); });

describe("Phase 5: refills", () => {
  it("predicts days left and alerts once per day when stock runs low", async () => {
    expect((await refills(await elder()))[0]).toMatchObject({ stock: 8, perDay: 2, daysLeft: 4 });
    await agent("log_medication", { med_name: "Metformin 500 mg", slot: "morning", status: "taken" }); // 7 left → 3 days
    await agent("log_medication", { med_name: "Metformin 500 mg", slot: "morning", status: "taken" }); // 6 left → 3 days
    const alerts = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "refill");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toMatch(/runs out in 3 days/);
    expect(alerts[0].severity).toBe("watch");
  });
});

describe("Phase 5: change detection", () => {
  it("flags a real mood drop as worth discussing with a doctor, once a week, never a diagnosis", async () => {
    const { addDays, localDate } = await import("../src/engine/ids");
    const today = localDate("Asia/Kolkata");
    for (let i = 1; i <= 6; i++) {
      const date = addDays(today, -i);
      const callId = `call_${date.replace(/-/g, "")}_0900`;
      const ci = await repo.getCheckIn(DEMO.elderId, callId);
      await repo.putCheckIn({ ...ci!, mood: 2 });
    }
    const changes = await detectChanges(await elder());
    expect(changes.map((c) => c.metric)).toContain("mood");
    await flagChanges(await elder());
    await flagChanges(await elder());
    const alerts = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "health_change");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toMatch(/isn't a diagnosis/);
  });
});

describe("Phase 5: doctor brief", () => {
  it("summarises adherence, mood, pain and questions, without private items", async () => {
    const b = await doctorBrief(await elder(), 30);
    expect(b.medicines[0]).toMatchObject({ name: "Metformin 500 mg" });
    expect(b.medicines[0].adherencePct).toBeGreaterThan(80);
    expect(b.pain.length).toBeGreaterThan(5);
    expect(b.questionsForDoctor.length).toBeGreaterThan(0);
    expect(JSON.stringify(b)).not.toMatch(/savings/i);
    expect(b.disclaimer).toMatch(/Not a medical record/);
  });
  it("is available to Claude through the family door", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runTool(FAMILY_TOOLS.get_doctor_brief.spec as any, { elder_id: DEMO.elderId }, { actor: "family:mem_ravi", familyId: DEMO.familyId });
    expect(JSON.parse(r.content[0].text).medicines).toBeDefined();
  });
});

describe("Phase 5: scam vaccine drills", () => {
  it("offers one drill a week in the call context and scores answers", async () => {
    const ctx = await buildContext(await elder(), "daily", "call_p5");
    expect(ctx.scam_drill).toMatch(/\[id:\w+\] Ask:/);
    const id = ctx.scam_drill.match(/\[id:(\w+)\]/)![1];
    await agent("log_scam_drill", { drill_id: id, passed: true, answer: "hang up" });
    expect(await nextDrill(await elder())).toBeNull(); // not again this week
    expect((await buildContext(await elder(), "daily", "call_p5b")).scam_drill).toBe("none");
    expect(await drillScore(await elder())).toMatchObject({ total: 1, passed: 1, pct: 100 });
  });
});
