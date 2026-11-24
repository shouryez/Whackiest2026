import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { callElder } from "../src/packs/kaiseho/calls";
import { buildDigest } from "../src/packs/kaiseho/digest";
import { kaisehoPostCall } from "../src/packs/kaiseho/postcall";
import { classifyScam } from "../src/packs/kaiseho/scam/classifier";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { getRepo } from "../src/repo";

const repo = getRepo();
beforeEach(async () => { await seedDemo({ resetEvents: true }); });

describe("weekly audio digest", () => {
  it("writes a warm script that ends with a call to action and keeps private items out", async () => {
    const d = await buildDigest((await repo.getElder(DEMO.elderId))!, { send: false });
    expect(d.script).toMatch(/Give her a call this week/);
    expect(d.script).not.toMatch(/savings/);
    expect((d.script.match(/\d+/g) ?? []).length).toBeLessThanOrEqual(4);
    expect(d.source).toBe("rules");
    expect((await repo.listDigests(DEMO.elderId))[0].digestId).toBe(d.digestId);
  });
});

describe("consent first", () => {
  it("blocks daily calls until the elder consents, then activates the schedule", async () => {
    const elder = (await repo.getElder(DEMO.elderId))!;
    elder.status = "pending_consent";
    await repo.putElder(elder);
    await expect(callElder(elder, "daily")).rejects.toThrow(/consent/);

    const { call } = await callElder(elder, "consent");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runTool(AGENT_TOOLS.record_consent.spec as any, { elder_id: DEMO.elderId, call_id: call.callId, daily_calls: true, preferred_time_local: "10:00", share_medicines: true, share_wellbeing: true, share_memories: false }, { actor: "agent" });
    await kaisehoPostCall.onTranscript({ type: "post_call_transcription", data: { conversation_id: "c_consent", transcript: [], conversation_initiation_client_data: { dynamic_variables: { elder_id: DEMO.elderId, call_id: call.callId } } } });

    const after = (await repo.getElder(DEMO.elderId))!;
    expect(after.status).toBe("active");
    expect(after.callTimeLocal).toBe("10:00");
    expect((await repo.getCall(DEMO.elderId, call.callId))?.summary?.family_en).toMatch(/agreed to a short daily check-in at 10:00/);
  });
});

describe("scam classifier layer 2", () => {
  it("falls back to rules when no LLM is configured, within the time budget", async () => {
    const t0 = Date.now();
    const r = await classifyScam("A CBI officer said stay on video call and don't tell anyone, transfer money now");
    expect(Date.now() - t0).toBeLessThan(1700);
    expect(r.verdict).toBe("likely_scam");
    expect(r.layers.llm).toBeNull();
  });
});
