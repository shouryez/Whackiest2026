import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Elder } from "@kaiseho/shared";
import { runTool } from "../src/control/tiers";
import { env } from "../src/env";
import { addDays, localDate } from "../src/engine/ids";
import { insightCards } from "../src/packs/kaiseho/aiInsights";
import { cardHtml, ensureCardToken, tokenOk } from "../src/packs/kaiseho/card";
import { buildContext } from "../src/packs/kaiseho/context";
import { playDemoCall } from "../src/packs/kaiseho/demoCall";
import { doctorBrief } from "../src/packs/kaiseho/health";
import { initJobs } from "../src/packs/kaiseho/jobs";
import { gasStatus, guessCategory, markNeedsTold, needsNote } from "../src/packs/kaiseho/needs";
import { computeNudge, logFamilyCall } from "../src/packs/kaiseho/nudges";
import { voiceVitality } from "../src/packs/kaiseho/postcall";
import { callRota } from "../src/packs/kaiseho/rota";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { FAMILY_TOOLS } from "../src/packs/kaiseho/tools/familyTools";
import { classify, DEFAULT_TARGETS } from "../src/packs/kaiseho/vitals";
import { conversationPlan, dimScores, findPatterns, indexOf, slope, wellbeingReport, type DayPoint } from "../src/packs/kaiseho/wellbeing";
import { getRepo } from "../src/repo";

/** Final-round features: human wellbeing + insights, home readings by voice, family coordination. */
const repo = getRepo();
const elder = async () => (await repo.getElder(DEMO.elderId))!;
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (name: keyof typeof AGENT_TOOLS, args: Record<string, unknown>) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_p8", ...args }, { actor: "agent" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const family = (name: keyof typeof FAMILY_TOOLS, args: Record<string, unknown> = {}, actor = "family:mem_ravi") => runTool(FAMILY_TOOLS[name].spec as any, { elder_id: DEMO.elderId, ...args }, { actor, familyId: DEMO.familyId });

beforeEach(async () => { await initJobs(); await seedDemo({ resetEvents: true }); });

describe("wellbeing from conversation, not ratings", () => {
  it("scores six dimensions 0-100 and a weighted index", () => {
    const s = dimScores({ mood: 5, sleep: "poor", appetite: "low", social: "met_people", activity: "went_out", pain: { where: "knee", level: 3 } });
    expect(s).toEqual({ mood: 100, sleep: 20, appetite: 25, social: 100, activity: 100, pain: 70 });
    expect(indexOf(s)).toBe(72); // 25 + 3 + 3.75 + 15 + 15 + 10.5
    expect(indexOf({ mood: 50 })).toBeNull(); // too little to judge
    expect(slope([6, 5, 4, 3])).toBe(-1);
  });

  it("log_wellbeing merges natural answers into one day", async () => {
    await agent("log_wellbeing", { appetite: "good" });
    await agent("log_wellbeing", { social: "met_people", activity: "went_out", highlight: "Jasmine flowered" });
    const r = parse(await agent("log_wellbeing", { mood: 4, sleep: "good" }));
    expect(r.ok).toBe(true);
    const ci = await repo.getCheckIn(DEMO.elderId, "call_p8");
    expect(ci).toMatchObject({ appetite: "good", social: "met_people", activity: "went_out", highlight: "Jasmine flowered", mood: 4, sleep: "good" });
  });

  it("finds her patterns in the seeded fortnight", async () => {
    const r = await wellbeingReport(await elder());
    const ids = r.patterns.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["sleep_mood", "company_mood", "pain_easing", "family_call_lift"]));
    expect(r.patterns.find((p) => p.id === "company_mood")!.detail).toMatch(/4\.2\/5.*2\.3\/5/);
    expect(r.baseline.n).toBeGreaterThanOrEqual(5);
    expect(r.today?.index).toBeGreaterThan(0);
    expect(r.highlights.at(-1)?.text).toMatch(/bisi bele bath/);
  });

  it("spots missed doses clustering on one weekday, and an alone streak", () => {
    const e = { preferredName: "Amma", gender: "female" } as Elder;
    const days: DayPoint[] = Array.from({ length: 21 }, (_, i) => {
      const date = addDays("2026-11-01", i); // 1 Nov 2026 is a Sunday
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return { date, index: 60, dims: {}, weekday, familyCall: false, missedDoses: weekday === 6 ? 1 : 0, social: i >= 17 ? "alone" : "met_people", mood: 3 };
    });
    const ids = findPatterns(e, days, []).map((p) => `${p.id}:${p.title}`);
    expect(ids.some((x) => x.startsWith("weekday_misses:") && x.includes("Saturdays"))).toBe(true);
    expect(ids.some((x) => x.startsWith("alone_streak:4 days"))).toBe(true);
  });

  it("voice vitality: speaking pace and reply gap from turn timings", () => {
    const t = [];
    for (let i = 0; i < 6; i++) {
      t.push({ role: "agent", message: "How are you feeling today Amma", time_in_call_secs: i * 10 });
      t.push({ role: "user", message: "I am fine beta the knee is a little better today thank you", time_in_call_secs: i * 10 + 3.5 });
    }
    const v = voiceVitality(t)!;
    expect(v.turns).toBeGreaterThanOrEqual(3);
    expect(v.wpm).toBeGreaterThan(60);
    expect(v.replyGapSec).toBeGreaterThanOrEqual(0);
    expect(voiceVitality([{ role: "user", message: "hi" }])).toBeUndefined();
  });

  it("today's topics rotate and include her personal hooks", async () => {
    const a = await conversationPlan(await elder(), "2026-11-27");
    const b = await conversationPlan(await elder(), "2026-11-28");
    expect(a).not.toBe(b);
    expect(a).toMatch(/\(appetite\)/);
    expect(a).toMatch(/jasmine/);
    expect((await buildContext(await elder(), "daily", "c1")).today_topics).toMatch(/jasmine/);
    expect((await buildContext(await elder(), "reminder", "c2")).today_topics).toBe("none");
  });

  it("AI suggestion cards fall back to grounded rules without a key", async () => {
    const out = await insightCards(await elder());
    expect(out.source).toBe("rules");
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.cards.length).toBeLessThanOrEqual(4);
    expect(out.cards.map((c) => c.title).join(" ")).toMatch(/Company|Bad nights|easing|happier/);
  });
});

describe("home readings by voice", () => {
  it("classifies against her targets", () => {
    const T = DEFAULT_TARGETS;
    expect(classify("sugar", 126, undefined, "fasting", T)).toBe("normal");
    expect(classify("sugar", 150, undefined, "fasting", T)).toBe("high");
    expect(classify("sugar", 150, undefined, "after_food", T)).toBe("normal");
    expect(classify("sugar", 62, undefined, "fasting", T)).toBe("low");
    expect(classify("sugar", 320, undefined, "random", T)).toBe("very_high");
    expect(classify("bp", 150, 90, "morning", T)).toBe("high");
    expect(classify("bp", 185, 100, "morning", T)).toBe("very_high");
    expect(classify("spo2", 88, undefined, undefined, T)).toBe("very_low");
  });

  it("normal reading: logged quietly; high: one watch alert a day; dangerous: urgent with the emergency path", async () => {
    expect(parse(await agent("log_vital", { kind: "sugar", value: 126, context: "fasting" })).status).toBe("normal");
    expect((await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "vital")).toHaveLength(0);
    await agent("log_vital", { kind: "bp", value: 150, value2: 92 });
    await agent("log_vital", { kind: "bp", value: 152, value2: 94 });
    expect((await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "vital" && a.severity === "watch")).toHaveLength(1);
    const r = parse(await agent("log_vital", { kind: "sugar", value: 340, context: "after_food" }));
    expect(r.status).toBe("very_high");
    expect(r.say).toMatch(/raise_emergency/);
    expect(r.say).toMatch(/Never suggest medicines/);
    expect((await repo.listAlerts(DEMO.familyId)).find((a) => a.type === "vital" && a.severity === "urgent")?.title).toMatch(/Sugar 340/);
  });

  it("refuses readings that can't be right, and BP needs both numbers", async () => {
    expect(JSON.stringify(await agent("log_vital", { kind: "sugar", value: 5000 }))).toMatch(/doesn't look right/);
    expect(JSON.stringify(await agent("log_vital", { kind: "bp", value: 140 }))).toMatch(/doesn't look right/);
  });

  it("the doctor brief and the call context include the readings", async () => {
    const b = await doctorBrief(await elder());
    const sugar = b.vitals.find((v) => v.label === "Sugar")!;
    expect(sugar.count).toBe(14);
    expect(sugar.outOfRange).toBeGreaterThan(0);
    expect(b.questionsForDoctor.join(" ")).toMatch(/Sugar was outside the target range/);
    expect((await buildContext(await elder(), "daily", "c3")).vitals_note).toMatch(/She checks her sugar and BP at home.*Last readings: Sugar 116/);
  });

  it("a critical medicine not taken yet gets one follow-up reminder call (never from a simulated call)", async () => {
    const e = await elder();
    e.phone = "+919812345678"; await repo.putElder(e);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: e.tz, hour: "2-digit", hour12: false }).format(new Date()));
    const r = parse(await agent("log_medication", { med_name: "Metformin 500 mg", slot: "night", status: "unsure", note: "not yet" }));
    if (hour < 22) {
      expect(r.follow_up).toMatch(/quick reminder call/);
      expect((await repo.listReminders(DEMO.elderId)).filter((x) => x.text.includes("Metformin"))).toHaveLength(1);
      await agent("log_medication", { med_name: "Metformin 500 mg", slot: "night", status: "unsure" });
      expect((await repo.listReminders(DEMO.elderId)).filter((x) => x.text.includes("Metformin"))).toHaveLength(1);
    }
    for (const x of await repo.listReminders(DEMO.elderId)) await repo.putReminder({ ...x, status: "cancelled" });
  });
});

describe("family coordination", () => {
  it("needs from the call reach both siblings; one claims; Amma hears who's arranging it", async () => {
    expect(guessCategory("gas cylinder")).toBe("gas");
    expect(guessCategory("BP tablets")).toBe("medicine");
    const r = parse(await agent("add_need", { items: [{ item: "Cooking oil" }, { item: "Atta and toor dal" }] }));
    expect(r.added).toEqual(["Cooking oil"]); // atta is already on the list
    await tick();
    const alert = (await repo.listAlerts(DEMO.familyId)).find((a) => a.type === "need")!;
    expect(alert.title).toBe("Amma needs: Cooking oil");

    const oil = (await repo.listNeeds(DEMO.elderId)).find((n) => n.item === "Cooking oil")!;
    const claimed = parse(await family("handle_need", { need_id: oil.needId, action: "claim" }, "family:mem_priya"));
    expect(claimed).toMatchObject({ by: "Priya", status: "claimed" });
    const note = await needsNote(await elder());
    expect(note).toMatch(/Priya is arranging the Cooking oil/);
    expect(note).toMatch(/Priya is arranging the Metformin strip/);

    await markNeedsTold(await elder(), new Date(Date.now() + 1000).toISOString());
    expect(await needsNote(await elder())).not.toMatch(/arranging/);
  });

  it("the gas cylinder is tracked: asked before it runs out, interval learned on refill", async () => {
    const e = await elder();
    expect(gasStatus(e)).toMatchObject({ daysSince: 40, daysLeft: 5 });
    expect(await needsNote(e)).toMatch(/gas cylinder was refilled 40 days ago/);
    await agent("add_need", { items: [{ item: "Gas cylinder", urgency: "soon" }] });
    expect(await needsNote(await elder())).not.toMatch(/refilled 40 days ago/); // don't ask again while it's on the list
    const gas = (await repo.listNeeds(DEMO.elderId)).find((n) => n.category === "gas")!;
    await family("handle_need", { need_id: gas.needId, action: "done" });
    const after = gasStatus(await elder())!;
    expect(after.lastRefill).toBe(localDate("Asia/Kolkata"));
    expect(after.intervalDays).toBe(43); // learned: (45 + 40) / 2
  });

  it("sibling rota: whose turn it is, and the nudge names them", async () => {
    const rota = await callRota(await elder());
    expect(rota.members.map((m) => m.name).sort()).toEqual(["Priya", "Ravi"]);
    expect(rota.nextUp?.name).toBe("Priya"); // Priya called 3 days ago, Ravi yesterday
    // Three days later, nobody has called.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 3 * 86400_000));
    try {
      const n = await computeNudge(await elder());
      expect(n?.text).toMatch(/^Priya, it's your turn: it's been [34] days since anyone called Amma/);
    } finally { vi.useRealTimers(); }
    await logFamilyCall(await elder(), "Priya", "button");
    expect((await callRota(await elder())).nextUp?.name).toBe("Ravi");
  });

  it("emergency health card: own token, read-only, shows what helps in an emergency", async () => {
    const e = await elder();
    const k = await ensureCardToken(e);
    expect(tokenOk(await elder(), k)).toBe(true);
    expect(tokenOk(await elder(), "wrong")).toBe(false);
    const html = await cardHtml(await elder());
    expect(html).toMatch(/Sulfa drugs/);
    expect(html).toMatch(/B\+/);
    expect(html).toMatch(/Metformin 500 mg/);
    expect(html).toMatch(/tel:112/);
    expect(html).not.toMatch(/savings/i);
    const k2 = await ensureCardToken(await elder(), true);
    expect(k2).not.toBe(k);
    expect(tokenOk(await elder(), k)).toBe(false); // rotated: the old link stops working
  });

  it("Claude can read wellbeing, readings, needs and the rota", async () => {
    const w = parse(await family("get_wellbeing"));
    expect(w.patterns.length).toBeGreaterThan(0);
    expect(w.suggestions.length).toBeGreaterThan(0);
    const v = parse(await family("get_vitals"));
    expect(v.readings.map((r: { kind: string }) => r.kind).sort()).toEqual(["bp", "sugar"]);
    expect(parse(await family("get_needs")).needs.length).toBe(2);
    expect(parse(await family("get_call_rota")).nextUp.name).toBe("Priya");
    expect(parse(await family("get_health_card")).url).toMatch(/\/card\/eld_lakshmi\?k=/);
  });
});

describe("the free demo call shows the final-round features", () => {
  it("human questions, a sugar reading and the needs list, with zero real calls", async () => {
    const saved = { ...env };
    const outbound: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (String(url).includes("outbound-call")) outbound.push(String(url)); return new Response("{}", { status: 200 }); }));
    try {
      await playDemoCall(await elder(), { pauseMs: 20 });
      await tick(4500);
      const tools = (await repo.listAudit(DEMO.elderId)).map((a) => a.tool);
      expect(tools).toEqual(expect.arrayContaining(["log_wellbeing", "log_vital", "add_need", "get_shared_with_family"]));
      const day = (await repo.listCheckIns(DEMO.elderId, localDate("Asia/Kolkata"))).at(-1)!;
      expect(day).toMatchObject({ appetite: "good", social: "met_people", activity: "went_out" });
      expect(outbound).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals(); Object.assign(env, saved);
    }
  });
});
