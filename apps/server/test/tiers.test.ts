import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools/agentTools";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { getRepo } from "../src/repo";

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (name: keyof typeof AGENT_TOOLS, args: Record<string, unknown>, familyId?: string) =>
  runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_test", ...args }, { actor: "agent", familyId });

describe("risk tiers", () => {
  beforeEach(async () => {
    await seedDemo({ resetEvents: true });
  });

  it("T2 send_family_message requires elder consent", async () => {
    const r = await run("send_family_message", { text: "hi", elder_consented: false, urgency: "normal" });
    expect(r.isError).toBe(true);
    expect(parse(r).reason).toMatch(/consent/);
  });

  it("T2 send_family_message is rate limited to 5 per call", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await run("send_family_message", { text: `m${i}`, elder_consented: true, urgency: "normal" });
      expect(ok.isError).toBeUndefined();
    }
    const r = await run("send_family_message", { text: "m6", elder_consented: true, urgency: "normal" });
    expect(parse(r).reason).toMatch(/rate limit/);
  });

  it("rejects unknown elders and other families", async () => {
    expect(parse(await run("log_wellbeing", { elder_id: "eld_nobody", mood: 3 })).reason).toBe("unknown elder");
    expect(parse(await run("log_wellbeing", { mood: 3 }, "fam_other")).reason).toBe("not in your family");
  });

  it("T3 check_scam alerts family and stores no raw OTP", async () => {
    const r = parse(await run("check_scam", { description: "CBI officer said arrest, stay on video call, don't tell anyone, tell OTP 482913" }));
    expect(r.family_alerted).toBe(true);
    const alerts = await getRepo().listAlerts(DEMO.familyId);
    const audit = await getRepo().listAudit(DEMO.elderId);
    const dump = JSON.stringify({ alerts, audit });
    expect(dump).not.toContain("482913");
    expect(dump).toContain("[REDACTED:otp]");
  });

  it("every tool call is audited and results stay short", async () => {
    const r = await run("log_medication", { med_name: "Metformin 500 mg", slot: "morning", status: "taken" });
    expect(r.content[0].text.length).toBeLessThan(400);
    const audit = await getRepo().listAudit(DEMO.elderId);
    expect(audit[0].tool).toBe("log_medication");
    expect(audit[0].tier).toBe("T1");
  });

  it("private memories never reach family views", async () => {
    const { todayView } = await import("../src/packs/kaiseho/views");
    await run("save_memory", { type: "preference", text: "Don't tell Ravi about the loan", private: true });
    const view = await todayView((await getRepo().getElder(DEMO.elderId))!);
    expect(JSON.stringify(view)).not.toContain("loan");
    expect(view.privateCount).toBeGreaterThanOrEqual(2);
  });
});
