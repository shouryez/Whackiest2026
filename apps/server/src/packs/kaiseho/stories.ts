import type { Elder, Story, StoryAsk } from "@kaiseho/shared";
import { ToolRejected } from "../../control/tiers";
import { redactPII } from "../../control/redact";
import { emit } from "../../engine/events";
import { localDate, newId, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";

/**
 * Yaadein, her life-story book. Every few days KaiseHo asks one gentle "tell me about…"
 * question (or one a grandchild sent from Telegram / the dashboard). With her permission the
 * story is kept as a chapter for the family: the stories that usually disappear with a generation.
 */
export const STORY_BANK: { id: string; en: string; hi: string; era: string }[] = [
  { id: "childhood_home", en: "What was the house you grew up in like?", hi: "आप जिस घर में बड़ी हुईं, वो कैसा था?", era: "Childhood" },
  { id: "childhood_game", en: "What games did you play as a little girl?", hi: "बचपन में आप कौन से खेल खेलती थीं?", era: "Childhood" },
  { id: "school_day", en: "Do you remember a teacher or a day from school?", hi: "स्कूल का कोई टीचर या कोई दिन याद है?", era: "Childhood" },
  { id: "festival_child", en: "How did your family celebrate festivals when you were young?", hi: "बचपन में आपके घर त्योहार कैसे मनाते थे?", era: "Childhood" },
  { id: "wedding", en: "Tell me about your wedding day.", hi: "अपनी शादी के दिन के बारे में बताइए।", era: "Young years" },
  { id: "first_meeting", en: "How did you and your husband first meet?", hi: "आप और बाबूजी पहली बार कैसे मिले थे?", era: "Young years" },
  { id: "first_home", en: "What was your first home after marriage like?", hi: "शादी के बाद आपका पहला घर कैसा था?", era: "Young years" },
  { id: "first_cooking", en: "Who taught you to cook, and what was the first dish you made?", hi: "आपको खाना बनाना किसने सिखाया? पहली बार क्या बनाया था?", era: "Young years" },
  { id: "children_born", en: "What do you remember about the day your first child was born?", hi: "आपके पहले बच्चे के जन्म का दिन कैसा था?", era: "Raising a family" },
  { id: "child_mischief", en: "What was the naughtiest thing your children did when they were small?", hi: "बच्चे छोटे थे तब सबसे बड़ी शरारत क्या की थी?", era: "Raising a family" },
  { id: "hard_time", en: "What was a difficult time, and how did you get through it?", hi: "कोई मुश्किल समय, और आप उससे कैसे निकलीं?", era: "Raising a family" },
  { id: "proudest", en: "What are you proudest of in your life?", hi: "ज़िंदगी में आपको किस बात पर सबसे ज़्यादा गर्व है?", era: "Wisdom" },
  { id: "recipe", en: "Which family recipe should never be lost? How do you make it?", hi: "घर की कौन सी रेसिपी कभी खोनी नहीं चाहिए? कैसे बनाती हैं?", era: "Recipes" },
  { id: "travel", en: "What is the best trip you ever took?", hi: "अब तक की सबसे अच्छी यात्रा कौन सी थी?", era: "Adventures" },
  { id: "first_film", en: "Do you remember the first film you saw in a cinema hall?", hi: "सिनेमा हॉल में पहली फ़िल्म कौन सी देखी थी?", era: "Adventures" },
  { id: "advice", en: "What advice would you give your grandchildren?", hi: "अपने पोते-पोतियों को आप क्या सलाह देंगी?", era: "Wisdom" },
  { id: "song", en: "Which song always takes you back in time?", hi: "कौन सा गाना आपको पुराने दिनों में ले जाता है?", era: "Adventures" },
  { id: "parents", en: "What were your parents like?", hi: "आपके माता-पिता कैसे थे?", era: "Childhood" },
];

/** Agent tool: keep a story she told (only with her yes). */
export async function saveStory(elder: Elder, a: { title: string; story: string; era?: string; people?: string[]; place?: string; ask_id?: string; prompt_id?: string; share_with_family: boolean; call_id?: string }) {
  const repo = getRepo();
  const text = redactPII(a.story).trim();
  if (text.length < 40) throw new ToolRejected("too short", "let her tell a little more, then save it");
  if (!a.share_with_family) {
    // Her story, her call: kept for her own future calls only, never shown to the family.
    await repo.putMemory({ elderId: elder.elderId, memoryId: newId("mem"), type: "story", text: `${a.title}: ${text}`.slice(0, 400), importance: 3, private: true, source: "tool", lastMentionedAt: nowIso(), createdAt: nowIso() });
    return { ok: true, kept_private: true, say: "That stays between us. Thank you for telling me." };
  }
  const asks = await repo.listStoryAsks(elder.elderId);
  const ask = a.ask_id ? asks.find((x) => x.askId === a.ask_id) : undefined;
  const bank = STORY_BANK.find((b) => b.id === a.prompt_id);
  const s: Story = {
    elderId: elder.elderId, familyId: elder.familyId, storyId: newId("sty"),
    title: redactPII(a.title).slice(0, 80), text: text.slice(0, 2400), era: a.era ?? bank?.era,
    people: (a.people ?? []).map((p) => redactPII(p).slice(0, 40)).slice(0, 8), place: a.place ? redactPII(a.place).slice(0, 60) : undefined,
    prompt: ask?.question ?? bank?.en ?? a.prompt_id, askedBy: ask?.fromName, callId: a.call_id, createdAt: nowIso(),
  };
  await repo.putStory(s);
  if (ask) await repo.putStoryAsk({ ...ask, status: "answered", storyId: s.storyId });
  emit("story.saved", elder.familyId, { storyId: s.storyId, title: s.title, label: `📖 New chapter: "${s.title}"` }, elder.elderId);
  await createAlert({
    elder, severity: "info", type: "story",
    title: `${elder.preferredName} told a story: ${s.title}`,
    body: s.text.length > 320 ? `${s.text.slice(0, 317)}…` : s.text,
    data: { storyId: s.storyId, askedBy: s.askedBy },
  });
  return { ok: true, chapter: (await repo.listStories(elder.elderId)).length, say: ask ? `Thank you. ${ask.fromName} will love this story.` : "What a lovely story. I've kept it in your story book for the family." };
}

/** A family member asks for a story ("Ajji, how did you learn to cook?"). Asked in her next call. */
export async function askStory(elder: Elder, question: string, fromName: string): Promise<StoryAsk> {
  const q = redactPII(question).trim().slice(0, 200);
  if (q.length < 8) throw new ToolRejected("question too short", "write the question you'd like her to answer");
  const waiting = (await getRepo().listStoryAsks(elder.elderId)).filter((x) => x.status === "waiting");
  if (waiting.length >= 5) throw new ToolRejected("5 questions already waiting", "she gets one story question per call; wait for the next ones to be answered");
  const ask: StoryAsk = { elderId: elder.elderId, askId: newId("ask"), question: q, fromName, status: "waiting", createdAt: nowIso() };
  await getRepo().putStoryAsk(ask);
  emit("story.saved", elder.familyId, { askId: ask.askId, label: `📖 ${fromName} asked ${elder.preferredName}: "${q}"` }, elder.elderId);
  return ask;
}

/** Dynamic variable `story_prompt`: a family question first, otherwise a bank prompt every third day. */
export async function storyPrompt(elder: Elder, today = localDate(elder.tz)): Promise<string> {
  const repo = getRepo();
  const ask = (await repo.listStoryAsks(elder.elderId)).find((x) => x.status === "waiting");
  if (ask) {
    return `${ask.fromName} wants to hear a story from her. Somewhere in the middle of the call, say ${ask.fromName} asked you to ask: "${ask.question}". Let her talk, listen, react warmly. Then ask if you can keep it in her story book for the family, and call save_life_story with ask_id "${ask.askId}".`;
  }
  const stories = await repo.listStories(elder.elderId);
  const last = stories[0]?.createdAt.slice(0, 10);
  if (last && (Date.parse(today) - Date.parse(last)) / 86400_000 < 3) return "none";
  const used = new Set(stories.map((s) => s.prompt));
  const next = STORY_BANK.find((b) => !used.has(b.en)) ?? STORY_BANK[Math.floor(Date.parse(today) / 86400_000) % STORY_BANK.length];
  return `If she has time and sounds cheerful, ask one memory question: "${next.hi}" (${next.en}). Listen more than you talk. If she enjoys telling it, ask "Shall I keep this story for the family?" and call save_life_story with prompt_id "${next.id}". Skip it on a busy or low day.`;
}

export async function storyBook(elder: Elder) {
  const repo = getRepo();
  const stories = await repo.listStories(elder.elderId);
  const asks = (await repo.listStoryAsks(elder.elderId)).filter((x) => x.status === "waiting");
  const used = new Set(stories.map((s) => s.prompt));
  const shareable = elder.privacy.shareMemories;
  return {
    shared: shareable,
    note: shareable ? undefined : `${elder.preferredName} chose to keep memories private, so stories stay with ${pr(elder).her}.`,
    stories: shareable ? stories : [],
    waiting: asks.map((a) => ({ askId: a.askId, question: a.question, fromName: a.fromName, createdAt: a.createdAt })),
    suggestions: STORY_BANK.filter((b) => !used.has(b.en)).slice(0, 6).map((b) => ({ id: b.id, question: b.en, era: b.era })),
    words: stories.reduce((n, s) => n + s.text.split(/\s+/).length, 0),
  };
}
