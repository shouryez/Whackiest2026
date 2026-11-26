import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env";
import { callElder } from "../src/packs/kaiseho/calls";
import { requestAppointment } from "../src/packs/kaiseho/clinic";
import { playDemoCall } from "../src/packs/kaiseho/demoCall";
import { raiseEmergency } from "../src/packs/kaiseho/emergency";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { getRepo } from "../src/repo";

/**
 * Regression (27 Nov 2026): "Play demo call" placed a REAL phone call once ElevenLabs keys were set.
 * Demo replays and placeholder numbers must never dial out, whatever keys are configured.
 */
const saved = { ...env };
let outbound: string[] = [];

beforeEach(async () => {
  Object.assign(env, { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "a", ELEVENLABS_PHONE_NUMBER_ID: "p", ELEVENLABS_BRIEFING_AGENT_ID: "b", ELEVENLABS_CLINIC_AGENT_ID: "c" });
  outbound = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("outbound-call")) outbound.push(String(url));
    return new Response(JSON.stringify({ success: true, conversation_id: "x", callSid: "y" }), { status: 200 });
  }));
  await seedDemo({ resetEvents: true });
  const e = (await getRepo().getElder(DEMO.elderId))!;
  e.phone = "+919812345678"; // a real-looking number
  await getRepo().putElder(e);
});
afterEach(() => { vi.unstubAllGlobals(); Object.assign(env, saved); });

describe("never ring a real phone by accident", () => {
  it("Play demo call never dials, even with keys and a real number", async () => {
    await playDemoCall((await getRepo().getElder(DEMO.elderId))!, { pauseMs: 200 });
    await new Promise((r) => setTimeout(r, 300));
    expect(outbound).toHaveLength(0);
  });

  it("placeholder numbers are never dialled (elder, briefing recipients, clinic)", async () => {
    const e = (await getRepo().getElder(DEMO.elderId))!;
    e.phone = "+910000000000"; await getRepo().putElder(e);
    await callElder(e, "checkin");
    await raiseEmergency(e, "fall", "test");
    await requestAppointment(e, { preferred: "Thursday", requestedBy: "family:mem_ravi" });
    await new Promise((r) => setTimeout(r, 50));
    expect(outbound).toHaveLength(0);
  });

  it("a real Call-now to a real number still dials (sanity)", async () => {
    await callElder((await getRepo().getElder(DEMO.elderId))!, "checkin");
    expect(outbound).toHaveLength(1);
  });
});
