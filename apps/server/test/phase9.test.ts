import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { addDays, localDate } from "../src/engine/ids";
import { createAlert, formatTelegram, alertButtons } from "../src/packs/kaiseho/alerts";
import { buildContext } from "../src/packs/kaiseho/context";
import { playDemoCall } from "../src/packs/kaiseho/demoCall";
import { initJobs } from "../src/packs/kaiseho/jobs";
import { gameNote, logGame, mindSummary } from "../src/packs/kaiseho/mindgym";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { askStory, saveStory, storyBook, storyPrompt } from "../src/packs/kaiseho/stories";
import { callCard, handleUpdate, parseRemind, todayCard } from "../src/packs/kaiseho/telegramBot";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { FAMILY_TOOLS } from "../src/packs/kaiseho/tools/familyTools";
import { getRepo } from "../src/repo";

/** Story book, mind gym, call style, Telegram 2.0. */
const repo = getRepo();
const elder = async () => (await repo.getElder(DEMO.elderId))!;
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (name: keyof typeof AGENT_TOOLS, args: Record<string, unknown>) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_p9", ...args }, { actor: "agent" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const family = (name: keyof typeof FAMILY_TOOLS, args: Record<string, unknown> = {}) => runTool(FAMILY_TOOLS[name].spec as any, { elder_id: DEMO.elderId, ...args }, { actor: "family:mem_ravi", familyId: DEMO.familyId });

beforeEach(async () => { await initJobs(); await seedDemo({ resetEvents: true }); });

const STORY = "We got married in my father's courtyard and it rained all morning. Everyone said it was lucky.";

describe("her story book", () => {
  it("asks the family's waiting question first, then answers it with her yes", async () => {
    const e = await elder();
    expect(await storyPrompt(e)).toMatch(/Aarav wants to hear a story.*ask_first_film/);
    const r = parse(await agent("save_life_story", { title: "My first film", story: STORY, ask_id: "ask_first_film", share_with_family: true }));
    expect(r.ok).toBe(true);
    expect(r.say).toMatch(/Aarav will love/);
    const book = await storyBook(e);
    expect(book.waiting).toHaveLength(0);
    expect(book.stories[0]).toMatchObject({ title: "My first film", askedBy: "Aarav" });
    const alert = (await repo.listAlerts(DEMO.familyId)).find((a) => a.type === "story");
    expect(alert?.title).toMatch(/told a story: My first film/);
  });

  it("keeps it private when she says no, and hides the book if memories are private", async () => {
    const e = await elder();
    const before = (await repo.listStories(e.elderId)).length;
    const r = await saveStory(e, { title: "A secret", story: STORY, share_with_family: false });
    expect(r.kept_private).toBe(true);
    expect((await repo.listStories(e.elderId)).length).toBe(before);
    expect((await repo.listMemories(e.elderId)).some((m) => m.private && m.type === "story")).toBe(true);
    e.privacy.shareMemories = false;
    const book = await storyBook(e);
    expect(book.stories).toHaveLength(0);
    expect(book.note).toMatch(/private/);
  });

  it("family can ask from Claude; a recent story means no bank question today", async () => {
    const r = parse(await family("request_story", { question: "How did you learn to ride a bicycle?" }));
    expect(r.ok).toBe(true);
    const e = await elder();
    for (const a of await repo.listStoryAsks(e.elderId)) await repo.putStoryAsk({ ...a, status: "answered" });
    await saveStory(e, { title: "Today", story: STORY, share_with_family: true });
    expect(await storyPrompt(e)).toBe("none");
    await expect(askStory(e, "short", "Ravi")).rejects.toThrow(/too short/);
  });

  it("lands in the call context", async () => {
    const ctx = await buildContext(await elder(), "daily", "call_x");
    expect(ctx.story_prompt).toMatch(/ask_first_film/);
    expect(ctx.voice_style).toMatch(/^WARM/);
  });
});

describe("mind gym", () => {
  it("plays every third check-in and never on reminder calls", async () => {
    const e = await elder();
    expect(await gameNote(e, "daily")).toBe("none"); // seeded game yesterday
    for (const g of await repo.listGames(e.elderId)) await repo.putGame({ ...g, date: addDays(g.date, -3) });
    expect(await gameNote(e, "daily")).toMatch(/log_brain_game/);
    expect(await gameNote(e, "reminder")).toBe("none");
  });

  it("compares with her usual and raises one gentle watch alert on a dip", async () => {
    const e = await elder();
    const s0 = await mindSummary(e);
    expect(s0.kinds.find((k) => k.game === "word_recall")?.trend).toBe("steady");
    for (let i = 0; i < 3; i++) await logGame(e, { game: "word_recall", score: 1, max: 3 });
    const s = await mindSummary(e);
    expect(s.kinds.find((k) => k.game === "word_recall")?.trend).toBe("dipping");
    const alerts = (await repo.listAlerts(DEMO.familyId)).filter((a) => a.type === "mind");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("watch");
    expect(alerts[0].body).toMatch(/never diagnoses/);
  });

  it("logs from the voice agent with a cheerful line", async () => {
    const r = parse(await agent("log_brain_game", { game: "word_recall", score: 3, max: 3 }));
    expect(r.say).toMatch(/sharp/);
  });
});

describe("call style", () => {
  it("she can ask for short calls by voice; family can set it from Claude", async () => {
    await agent("update_call_preferences", { action: "style_clear" });
    expect((await elder()).voiceStyle).toBe("clear");
    expect((await buildContext(await elder(), "daily", "c")).voice_style).toMatch(/^CLEAR/);
    await family("set_call_style", { style: "warm" });
    expect((await elder()).voiceStyle).toBe("warm");
  });
});

describe("Telegram 2.0", () => {
  it("parses reminders the way families type them", () => {
    const tz = "Asia/Kolkata";
    const now = new Date("2026-11-28T04:00:00Z"); // 09:30 IST
    const a = parseRemind("tomorrow 9am eye drops", tz, now)!;
    expect(a.what).toBe("eye drops");
    expect(a.when.toISOString()).toBe("2026-11-29T03:30:00.000Z");
    const b = parseRemind("18:30 BP tablet", tz, now)!;
    expect(b.when.toISOString()).toBe("2026-11-28T13:00:00.000Z");
    const c = parseRemind("8am walk", tz, now)!; // already past today → tomorrow
    expect(c.when.toISOString()).toBe("2026-11-29T02:30:00.000Z");
    expect(parseRemind("in 2 hours call Priya", tz, now)!.when.getTime()).toBe(now.getTime() + 7200_000);
    expect(parseRemind("someday", tz, now)).toBeNull();
  });

  it("alert cards are clean and buttons fit what you can do", async () => {
    const e = await elder();
    const a = await createAlert({ elder: e, severity: "urgent", type: "scam", title: "Scam call blocked", body: "A fake CBI officer asked for her OTP." });
    const html = formatTelegram(a, e, ["👉 Please call her today"]);
    expect(html).toMatch(/^🚨 <b>URGENT · Scam call blocked<\/b>/);
    expect(html).toMatch(/Cyber fraud 1930/);
    expect(alertButtons(a, e)![0].map((b) => b.callback_data)).toEqual([`ack:${a.alertId}`, `ca:${e.elderId}`]);
    const need = await createAlert({ elder: e, severity: "info", type: "need", title: "Needs gas", body: "x", data: { needIds: ["need_atta"] } });
    expect(alertButtons(need, e)![0][0].callback_data).toBe(`nh:${need.alertId}`);
  });

  it("the demo call fills the story book and mind gym; today and post-call cards read like messages", async () => {
    await playDemoCall(await elder(), { scam: false, pauseMs: 0 });
    const e0 = await elder();
    for (let i = 0; i < 80 && !(await repo.listCalls(e0.elderId)).some((c) => c.mode === "simulated" && c.status === "completed"); i++) await new Promise((r) => setTimeout(r, 100));
    const e = await elder();
    expect((await repo.listStories(e.elderId)).some((s) => s.title.includes("Kasturi Nivasa"))).toBe(true);
    expect((await repo.listGames(e.elderId, localDate(e.tz))).some((g) => g.game === "word_recall")).toBe(true);
    const t = await todayCard(e);
    expect(t.html).toMatch(/Amma today/);
    expect(t.html).toMatch(/Medicines/);
    expect(t.buttons.flat().map((b) => b.callback_data)).toContain(`ca:${e.elderId}`);
    const call = (await repo.listCalls(e.elderId)).find((c) => c.mode === "simulated" && c.summary)!;
    const card = await callCard(e, call);
    expect(card.html).toMatch(/check-in is done/);
    expect(card.buttons[0][0].callback_data).toBe(`rp:${e.elderId}`);
  }, 20000);

  it("handles commands and plain text without a bot token (no crash, no network)", async () => {
    await handleUpdate({ message: { message_id: 1, chat: { id: 999 }, text: "/today" } });
    await handleUpdate({ message: { message_id: 2, chat: { id: 999 }, text: "hello" } });
    await handleUpdate({ callback_query: { id: "cb1", data: "nl:eld_lakshmi", message: { message_id: 3, chat: { id: 999 } } } });
    expect(true).toBe(true);
  });
});
