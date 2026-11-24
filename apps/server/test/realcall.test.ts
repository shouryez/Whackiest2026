import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { scoreScamRules } from "../src/packs/kaiseho/scam/rules";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { getRepo } from "../src/repo";

/** Regressions from the first real phone call (24 Nov 2026). */
describe("real-call regressions", () => {
  beforeEach(async () => { await seedDemo({ resetEvents: true }); });

  it("Hinglish 'RBI asked for OTP, account will be blocked' is a likely scam", () => {
    const r = scoreScamRules("RBI se call aaya tha, OTP maanga tha. Maine kuch nahi diya, call cut diya. Phir WhatsApp message aaya ki OTP nahi diya, account block ho jayega.");
    expect(r.verdict).toBe("likely_scam");
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it("Devanagari 'bank ne OTP maanga' is a likely scam", () => {
    expect(scoreScamRules("आज मुझे एक RBI से call आया था। उन्होंने मुझसे एक OTP मांगा था।").verdict).toBe("likely_scam");
  });

  it("a real bank FD reminder without OTP stays safe", () => {
    expect(scoreScamRules("The bank branch called, my FD is maturing next week, I should visit with my passbook").verdict).toBe("probably_safe");
  });

  it("a dose that isn't due yet is never logged as missed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runTool(AGENT_TOOLS.log_medication.spec as any, { elder_id: DEMO.elderId, call_id: "c", med_name: "Metformin 500 mg", slot: "night", status: "missed" }, { actor: "agent" });
    const log = (await getRepo().listMedLogs(DEMO.elderId)).find((l) => l.callId === "c")!;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()));
    if (hour < 22 && hour >= 5) expect(log.status).toBe("unsure");
    else expect(["missed", "unsure"]).toContain(log.status);
  });
});
