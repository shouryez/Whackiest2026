import { beforeEach, describe, expect, it } from "vitest";
import { fitJson, runTool } from "../src/control/tiers";
import { runJob } from "../src/engine/jobs";
import { addDays, localDate } from "../src/engine/ids";
import { pending } from "../src/engine/scheduler";
import { buildContext } from "../src/packs/kaiseho/context";
import { playDemoCall } from "../src/packs/kaiseho/demoCall";
import { festivalsFor, nextDate, occasionFamilyNudges, occasionsNote, upcomingOccasions } from "../src/packs/kaiseho/occasions";
import { lifeCertStatus, lifeCertWindow, pensionNote } from "../src/packs/kaiseho/pension";
import { initJobs } from "../src/packs/kaiseho/jobs";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { FAMILY_TOOLS } from "../src/packs/kaiseho/tools/familyTools";
import { sharedReadback } from "../src/packs/kaiseho/transparency";
import { getRepo } from "../src/repo";

/** P2-9 pension, P2-10 occasions, P2-11 reminders (family side), P2-12 multi-elder, P2-13 "what did you tell Ravi?". */
const repo = getRepo();
const elder = async (id: string = DEMO.elderId) => (await repo.getElder(id))!;
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (name: keyof typeof AGENT_TOOLS, args: Record<string, unknown>, elderId: string = DEMO.elderId) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: elderId, call_id: "call_p7", ...args }, { actor: "agent" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const family = (name: keyof typeof FAMILY_TOOLS, args: Record<string, unknown> = {}) => runTool(FAMILY_TOOLS[name].spec as any, { elder_id: DEMO.elderId, ...args }, { actor: "family:mem_ravi", familyId: DEMO.familyId });

beforeEach(async () => { await initJobs(); await seedDemo({ resetEvents: true }); });

describe("P2-13: 'What did you tell Ravi?'", () => {
  it("reads back exactly what the family saw, and never the private things", async () => {
    await agent("send_family_message", { text: "Tell Ravi I miss him", elder_consented: true });
    await agent("check_scam", { description: "A CBI officer said my Aadhaar is in a money laundering case, stay on video call", channel: "video_call" });
    await tick();
    const r = parse(await agent("get_shared_with_family", { days: 3 }));
    expect(r.has_summary).toBe(true);
    expect(r.say).toMatch(/sent Ravi this short note/);
    expect(r.say).toMatch(/Scam attempt blocked/i);
    expect(r.say).toMatch(/Tell Ravi I miss him/);
    expect(r.say).toMatch(/keep private was not shared/);
    expect(r.say).not.toMatch(/savings/i);
    expect(r.say).toMatch(/scams and emergencies always go to the family/);
  });

  it("a long read-back still reaches the voice agent as valid JSON", async () => {
    for (let i = 0; i < 4; i++) await agent("send_family_message", { text: `A fairly long message number ${i} about the garden, the temple and the neighbours`, elder_consented: true, call_id: `c${i}` });
    const raw = (await agent("get_shared_with_family", { days: 3 })).content[0].text;
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw.length).toBeLessThanOrEqual(1400);
  });

  it("fitJson shortens strings instead of cutting JSON in half", () => {
    const out = fitJson({ ok: true, say: "x".repeat(2000), list: ["a".repeat(300), "b"] }, 400);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(JSON.parse(out).ok).toBe(true);
    expect(JSON.parse(out).list[1]).toBe("b");
  });

  it("the family sees the same read-back (one truth on both sides)", async () => {
    const fromFamily = parse(await family("get_what_she_hears"));
    expect(fromFamily.say).toBe((await sharedReadback(await elder())).say);
    expect(fromFamily.lastSummary.text).toMatch(/Amma sounded/);
  });

  it("'don't tell Ravi about my knee' makes it private from now on", async () => {
    expect((await buildContext(await elder(), "daily", "c1")).follow_ups).toMatch(/knee/i);
    const r = parse(await agent("keep_private", { topic: "my knee" }));
    expect(r.hidden).toBe(1);
    expect(r.say).toMatch(/already sent stays sent/);
    const ctx = await buildContext(await elder(), "daily", "c2");
    expect(ctx.follow_ups).not.toMatch(/knee/i);
    expect(ctx.privacy_note).toMatch(/private/);
    expect(JSON.stringify((await repo.listMemories(DEMO.elderId)).filter((m) => !m.private))).not.toMatch(/temple stairs/);
  });
});

describe("P2-9: pension life certificate (Jeevan Pramaan)", () => {
  it("window: November for everyone, from 1 October for 80+", () => {
    expect(lifeCertWindow({ age: 68, tz: "Asia/Kolkata" }, "2026-11-27")).toMatchObject({ open: true, daysLeft: 3, end: "2026-11-30" });
    expect(lifeCertWindow({ age: 68, tz: "Asia/Kolkata" }, "2026-10-15").open).toBe(false);
    expect(lifeCertWindow({ age: 82, tz: "Asia/Kolkata" }, "2026-10-15")).toMatchObject({ open: true, superSenior: true });
    expect(lifeCertWindow({ age: 68, tz: "Asia/Kolkata" }, "2026-12-01").open).toBe(false);
  });

  it("asks only while due, never asks for numbers, and backs off for 3 days after asking", async () => {
    const e = await elder();
    const note = pensionNote(e, "Ravi", "2026-11-27");
    expect(note).toMatch(/due by 30 November \(3 days left\)/);
    expect(note).toMatch(/Never ask for Aadhaar, PPO or bank numbers/);
    expect(pensionNote(e, "Ravi", "2026-12-02")).toBe("none");
    e.pension!.lifeCert = { year: 2026, status: "not_yet", updatedAt: "x", askedOn: "2026-11-26" };
    expect(pensionNote(e, "Ravi", "2026-11-27")).toBe("none");
    expect(pensionNote(e, "Ravi", "2026-11-29")).not.toBe("none");
    e.pension!.lifeCert = { year: 2026, status: "done", updatedAt: "x" };
    expect(pensionNote(e, "Ravi", "2026-11-28")).toBe("none");
    e.pension = undefined;
    expect(pensionNote(e, "Ravi", "2026-11-27")).toBe("none");
  });

  it("'needs help' tells the family with a checklist; 'done' is good news; last year's doesn't count", async () => {
    await agent("log_life_certificate", { status: "needs_help" });
    let alerts = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "pension");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toMatch(/needs help with her life certificate/);
    expect(lifeCertStatus(await elder()).status).toBe("needs_help");
    expect(lifeCertStatus(await elder()).askedOn).toBe(localDate("Asia/Kolkata"));

    await family("mark_life_certificate", { status: "done", method: "face app" });
    alerts = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "pension");
    expect(alerts.map((a) => a.title)).toContain("Amma's life certificate is submitted ✓");
    expect(lifeCertStatus(await elder()).status).toBe("done");
    const nextYear = `${Number(localDate("Asia/Kolkata").slice(0, 4)) + 1}-11-05`;
    expect(lifeCertStatus(await elder(), nextYear).status).toBe("pending");
  });

  it("a pension 'life certificate update' call asking for an OTP is flagged as a scam", async () => {
    const r = parse(await agent("check_scam", { description: "A bank man called, said my pension will stop unless I update my life certificate today, and asked for the OTP", channel: "phone" }));
    expect(r.verdict).toBe("likely_scam");
  });
});

describe("P2-10: occasions and relayed wishes", () => {
  it("dates: yearly, one-off and 29 Feb", () => {
    expect(nextDate("12-25", "2026-11-27")).toBe("2026-12-25");
    expect(nextDate("01-05", "2026-11-27")).toBe("2027-01-05");
    expect(nextDate("2026-11-01", "2026-11-27")).toBeUndefined();
    expect(nextDate("02-29", "2027-01-10")).toBe("2027-02-28");
  });

  it("festivals are regional: Mysuru gets Kannada Rajyotsava, Lucknow doesn't", () => {
    expect(festivalsFor({ city: "Mysuru" }).map((f) => f.name)).toContain("Kannada Rajyotsava");
    expect(festivalsFor({ city: "Lucknow" }).map((f) => f.name)).not.toContain("Kannada Rajyotsava");
    expect(festivalsFor({ city: "Lucknow" }).map((f) => f.name)).toContain("Christmas");
  });

  it("the grandson's birthday is offered in the call; her wish reaches the family once, with consent", async () => {
    const note = await occasionsNote(await elder());
    expect(note).toMatch(/\[id:occ_aarav_bday\] Aarav \(her grandson\)'s birthday is on \w+ \(in 2 days\)/);
    expect(JSON.stringify(await agent("relay_wish", { occasion_id: "occ_aarav_bday", wish: "Happy birthday Aarav", elder_consented: false }))).toMatch(/consent/);
    expect((await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "occasion")).toHaveLength(0);

    await agent("relay_wish", { occasion_id: "occ_aarav_bday", wish: "Happy birthday my dear Aarav, Ajji loves you", elder_consented: true });
    const alert = (await repo.listAlerts(DEMO.familyId)).find((a) => a.type === "occasion")!;
    expect(alert.title).toBe("Amma's wish for Aarav's birthday");
    expect(alert.body).toMatch(/Ajji loves you/);
    expect((await repo.listMessages(DEMO.elderId)).some((m) => m.direction === "from_elder" && m.text.includes("For Aarav"))).toBe(true);
    expect(await occasionsNote(await elder())).not.toMatch(/occ_aarav_bday/); // not offered again this year
  });

  it("her own birthday: KaiseHo wishes her first, and the family gets one nudge the day before", async () => {
    const today = localDate("Asia/Kolkata");
    const amma = (await repo.listOccasions(DEMO.familyId)).find((o) => o.occasionId === "occ_amma_bday")!;
    await repo.putOccasion({ ...amma, date: today.slice(5) });
    expect(await occasionsNote(await elder())).toMatch(/Today is her birthday! Wish her warmly at the very start/);

    await repo.putOccasion({ ...amma, date: addDays(today, 1).slice(5) });
    await occasionFamilyNudges(await elder());
    await occasionFamilyNudges(await elder());
    const nudges = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "occasion");
    expect(nudges).toHaveLength(1);
    expect(nudges[0].title).toBe("Tomorrow is Amma's birthday 🎂");
  });

  it("festival greeting the day before and on the day (Christmas)", async () => {
    expect(await occasionsNote(await elder(), "2026-12-24")).toMatch(/Christmas is tomorrow: greet her with "Merry Christmas"/);
    expect((await upcomingOccasions(await elder(), 30, "2026-12-24")).find((o) => o.title === "Christmas")?.daysAway).toBe(1);
  });

  it("family adds an occasion from Claude; bad dates are refused", async () => {
    const ok = parse(await family("add_occasion", { title: "Ravi & Meera's anniversary", date: "02-14", kind: "anniversary", person: "Ravi and Meera", relation: "son and daughter-in-law" }));
    expect(ok.ok).toBe(true);
    const bad = await family("add_occasion", { title: "Nope", date: "14/02", kind: "birthday" });
    expect(JSON.stringify(bad)).toMatch(/MM-DD/);
    const list = parse(await family("get_occasions", { days: 366 }));
    expect(list.occasions.map((o: { title: string }) => o.title)).toContain("Ravi & Meera's anniversary");
  });
});

describe("P2-11: reminders the family can see, set and cancel", () => {
  const inDays = (n: number, hm = "18:00") => `${addDays(localDate("Asia/Kolkata"), n)}T${hm}`;

  it("family sets a reminder call, sees it, cancels it, and the cancelled job never calls", async () => {
    const set = parse(await family("set_reminder_for_elder", { text: "check your BP", when_local_iso: inDays(1) }));
    expect(set.when).toMatch(/^tomorrow at 6:00/);
    const list = parse(await family("get_reminders"));
    expect(list.reminders).toHaveLength(1);
    expect(list.reminders[0]).toMatchObject({ text: "check your BP", set_by: "family:mem_ravi" });
    expect(pending()).toContain(set.reminder_id);

    await family("cancel_reminder", { reminder_id: set.reminder_id });
    expect(pending()).not.toContain(set.reminder_id);
    expect(parse(await family("get_reminders")).reminders).toHaveLength(0);
    await runJob({ type: "call", elderId: DEMO.elderId, reason: "reminder", reminderId: set.reminder_id, extras: { reminder_text: "check your BP" } });
    expect((await repo.listCalls(DEMO.elderId)).filter((c) => c.reason === "reminder")).toHaveLength(0);
  });

  it("refuses the past, more than 30 days ahead, and a 6th waiting reminder", async () => {
    expect(JSON.stringify(await family("set_reminder_for_elder", { text: "x past", when_local_iso: inDays(-1) }))).toMatch(/passed/);
    expect(JSON.stringify(await family("set_reminder_for_elder", { text: "x far", when_local_iso: inDays(45) }))).toMatch(/too far/);
    for (let i = 1; i <= 5; i++) await family("set_reminder_for_elder", { text: `r${i}`, when_local_iso: inDays(i) });
    expect(parse(await family("get_reminders")).reminders).toHaveLength(5);
    expect(JSON.stringify(await family("set_reminder_for_elder", { text: "r6", when_local_iso: inDays(6) }))).toMatch(/already 5 reminders waiting/);
  });

  it("an elder-set reminder (by voice) shows up for the family too", async () => {
    await agent("set_reminder", { text: "call the plumber", when_local_iso: inDays(2, "10:00") });
    const r = parse(await family("get_reminders")).reminders;
    expect(r[0]).toMatchObject({ text: "call the plumber", set_by: "elder" });
  });
});

describe("P2-12: two parents, two languages, one family", () => {
  it("each elder gets their own language, call time, medicines and occasions", async () => {
    await seedDemo({ resetEvents: true, inLaws: true });
    expect((await repo.listAllElders()).map((e) => e.elderId).sort()).toEqual(["eld_lakshmi", "eld_nirmala"]);
    const n = await buildContext(await elder("eld_nirmala"), "daily", "cn");
    expect(n.language).toBe("Hindi");
    expect(n.meds_today).toMatch(/Thyroxine/);
    expect(n.meds_today).not.toMatch(/Metformin/);
    expect(n.occasions).not.toMatch(/Aarav/); // Aarav's birthday was added for Amma
    expect(n.pension_note).toBe("none"); // not a pensioner
    expect((await buildContext(await elder(), "daily", "cl")).language).toBe("Kannada");
    const listed = parse(await family("list_elders"));
    expect(listed.elders.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Lakshmi (Amma)", "Nirmala (Mummy ji)"]));
  });
});

describe("the free demo call shows the new moments", () => {
  it("wish relayed, pension asked (in November), and 'what did you tell Ravi?' answered", async () => {
    await playDemoCall(await elder(), { pauseMs: 20 });
    await tick(4000);
    const tools = (await repo.listAudit(DEMO.elderId)).map((a) => a.tool);
    expect(tools).toContain("relay_wish");
    expect(tools).toContain("get_shared_with_family");
    if (lifeCertWindow(await elder()).open) expect(tools).toContain("log_life_certificate");
  });
});
