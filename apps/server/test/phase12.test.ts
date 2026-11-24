import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { signElevenLabs, verifyElevenLabs } from "../src/engine/webhooks/verify";
import { buildContext } from "../src/packs/kaiseho/context";
import { weeklySummary } from "../src/packs/kaiseho/family";
import { familyCallStats, logFamilyCall } from "../src/packs/kaiseho/nudges";
import { kaisehoPostCall, purgeTranscripts } from "../src/packs/kaiseho/postcall";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { FAMILY_TOOLS } from "../src/packs/kaiseho/tools/familyTools";
import { getRepo } from "../src/repo";

const repo = getRepo();
const elder = async () => (await repo.getElder(DEMO.elderId))!;
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (name: keyof typeof AGENT_TOOLS, args: Record<string, unknown>) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_t", ...args }, { actor: "agent" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const family = (name: keyof typeof FAMILY_TOOLS, args: Record<string, unknown>, familyId: string = DEMO.familyId) => runTool(FAMILY_TOOLS[name].spec as any, { elder_id: DEMO.elderId, ...args }, { actor: "family:mem_ravi", familyId });

beforeEach(async () => { await seedDemo({ resetEvents: true }); });

describe("webhook signature", () => {
  it("accepts a valid signature and rejects tampering / stale", () => {
    const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "c1" } });
    const sig = signElevenLabs("s3cret", body);
    expect(verifyElevenLabs("s3cret", body, sig).ok).toBe(true);
    expect(verifyElevenLabs("s3cret", body + " ", sig).ok).toBe(false);
    expect(verifyElevenLabs("wrong", body, sig).ok).toBe(false);
    expect(verifyElevenLabs("s3cret", body, signElevenLabs("s3cret", body, Math.floor(Date.now() / 1000) - 7200)).ok).toBe(false);
    expect(verifyElevenLabs("s3cret", body, undefined).ok).toBe(false);
  });
});

describe("context builder", () => {
  it("pushes meds, follow-ups, undelivered messages and a privacy note (topics only)", async () => {
    const v = await buildContext(await elder(), "daily", "call_x");
    expect(v.meds_today).toContain("Metformin 500 mg");
    expect(v.follow_ups).toContain("temple stairs");
    expect(JSON.parse(v.family_messages)[0].text).toBe("I'll visit on Sunday");
    expect(v.privacy_note).not.toContain("savings");
    expect(v.preferred_name).toBe("Amma");
    expect(Object.values(v).every((x) => typeof x === "string")).toBe(true);
  });
});

describe("post-call pipeline", () => {
  it("redacts and stores the transcript, summarises, purges after retention", async () => {
    await agent("log_wellbeing", { mood: 2, sleep: "poor" });
    await agent("log_medication", { med_name: "Metformin 500 mg", slot: "morning", status: "missed" });
    await kaisehoPostCall.onTranscript({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_1",
        transcript: [{ role: "agent", message: "How are you?" }, { role: "user", message: "Not good. Ravi called yesterday. The bank man asked my OTP 123456." }],
        conversation_initiation_client_data: { dynamic_variables: { elder_id: DEMO.elderId, call_id: "call_t" } },
      },
    });
    const call = await repo.getCall(DEMO.elderId, "call_t");
    expect(call?.status).toBe("completed");
    expect(call?.summary?.family_en).toMatch(/missed/i);
    const turns = await repo.listTurns("call_t");
    expect(JSON.stringify(turns)).not.toContain("123456");
    expect(JSON.stringify(turns)).toContain("[REDACTED:otp]");
    // "Ravi called yesterday" counts as a family call.
    expect((await repo.listFamilyCalls(DEMO.elderId)).some((f) => f.source === "elder_mentioned" && f.by === "Ravi" && f.at > new Date(Date.now() - 60000).toISOString())).toBe(true);
    // Purge job removes turns once past purgeAt.
    for (const t of turns) t.purgeAt = new Date(Date.now() - 1000).toISOString();
    await repo.putTurns(turns);
    expect(await purgeTranscripts()).toBe(turns.length);
    expect(await repo.listTurns("call_t")).toHaveLength(0);
  });
});

describe("agent tools (phase 1)", () => {
  it("mark_message_delivered marks the family message", async () => {
    const r = parse(await agent("mark_message_delivered", { message_id: "msg_ravi_sunday" }));
    expect(r.ok).toBe(true);
    expect((await repo.getMessage(DEMO.elderId, "msg_ravi_sunday"))?.delivered).toBe(true);
  });
  it("update_call_preferences pauses and informs family", async () => {
    const r = parse(await agent("update_call_preferences", { action: "pause_until", until_date: "2099-01-01", reason: "going to my sister's" }));
    expect(r.spoken_confirmation).toMatch(/Paused/);
    expect((await elder()).status).toBe("paused");
    expect((await repo.listAlerts(DEMO.familyId)).some((a) => a.type === "pause")).toBe(true);
  });
  it("raise_emergency alerts everyone incl. neighbour, and never promises an ambulance", async () => {
    const r = parse(await agent("raise_emergency", { kind: "chest_pain", details: "chest is paining" }));
    expect(r.alerted).toEqual(expect.arrayContaining(["Ravi", "Priya", "Kamala aunty"]));
    expect(r.say).toMatch(/112/);
    expect(r.say).toMatch(/Never say an ambulance/);
    expect((await repo.listAlerts(DEMO.familyId))[0].severity).toBe("emergency");
  });
  it("record_consent sets the elder's sharing choices", async () => {
    await agent("record_consent", { daily_calls: true, preferred_time_local: "10:00", share_medicines: true, share_wellbeing: true, share_memories: false });
    const e = await elder();
    expect(e.privacy.shareMemories).toBe(false);
    expect(e.callTimeLocal).toBe("10:00");
    expect(e.consentId).toBeTruthy();
  });
});

describe("family door (/mcp/family tools)", () => {
  it("weekly summary never leaks private memories", async () => {
    const s = await weeklySummary(await elder());
    expect(JSON.stringify(s)).not.toContain("savings");
    expect(s.narrative).toMatch(/Family calls this week/);
  });
  it("add_medication + leave_message flow into the next call's context", async () => {
    await family("add_medication", { name: "Telmisartan", dose: "40 mg", slots: ["night"] });
    await family("leave_message_for_elder", { text: "Coming Sunday with the kids", from_name: "Ravi" });
    const v = await buildContext(await elder(), "daily", "call_next");
    expect(v.meds_today).toContain("Telmisartan 40 mg");
    expect(v.family_messages).toContain("Coming Sunday");
  });
  it("is scoped to the caller's family", async () => {
    const r = await family("get_status", {}, "fam_someone_else");
    expect(parse(r).reason).toBe("not in your family");
  });
  it("'I called her' raises the headline metric", async () => {
    const before = (await familyCallStats(await elder())).thisWeek;
    await logFamilyCall(await elder(), "Ravi", "button");
    expect((await familyCallStats(await elder())).thisWeek).toBe(before + 1);
  });
});
