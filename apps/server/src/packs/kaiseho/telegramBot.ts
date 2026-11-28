import type { Call, Elder, Member } from "@kaiseho/shared";
import { redactPII } from "../../control/redact";
import { env } from "../../env";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { llmTranscribe } from "../../engine/llm";
import {
  answerCallback, editTelegram, escapeHtml as esc, getTelegramFile, sendTelegramAudio, sendTelegramMsg, type InlineButton,
} from "../../engine/notify/telegram";
import { readAudio } from "../../engine/tts";
import { getRepo } from "../../repo";
import { ackAlert, alertHtml, refreshAlertCopies } from "./alerts";
import { callElder } from "./calls";
import { refills } from "./health";
import { mindSummary } from "./mindgym";
import { claimNeed, completeNeed, gasStatus } from "./needs";
import { logFamilyCall } from "./nudges";
import { createReminder, localToUtc } from "./reminders";
import { DEMO } from "./seed";
import { STORY_BANK, askStory } from "./stories";
import { todayView } from "./views";
import { vitalsSummary } from "./vitals";

/**
 * KaiseHo on Telegram: the family's remote control. Clean cards, one-tap actions that
 * update everyone's copy ("✅ Ravi is on it"), and commands for the things families do daily:
 * how is she today, tell her something, who's buying the gas, remind her, ask her for a story.
 */
export const BOT_COMMANDS = [
  { command: "today", description: "How she is today" },
  { command: "tell", description: "A message she hears in her next call" },
  { command: "needs", description: "Her shopping & household list" },
  { command: "meds", description: "Today's medicines" },
  { command: "call", description: "Ask KaiseHo to call her now" },
  { command: "remind", description: "e.g. /remind tomorrow 9am eye drops" },
  { command: "story", description: "Ask her for a story from her life" },
  { command: "stories", description: "Her latest stories" },
  { command: "away", description: "Pause calls (travelling / staying with you)" },
  { command: "digest", description: "This week's audio digest" },
  { command: "help", description: "Everything I can do" },
];

const LINK_CODES: Record<string, string> = { ravi: "mem_ravi", priya: "mem_priya" };
const MOOD = ["", "very low", "low", "okay", "good", "very good"];
const MOOD_FACE = ["", "😞", "😕", "😐", "🙂", "😄"];
const SLEEP: Record<string, string> = { good: "slept well", ok: "slept okay", poor: "slept poorly" };
const dots = (n: number, of = 5) => "●".repeat(Math.max(0, Math.min(of, n))) + "○".repeat(Math.max(0, of - n));
const hm = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
const dayName = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
const sentences = (s: string, n: number) => s.split(/(?<=[.!?])\s+/).slice(0, n).join(" ");

// What the user is typing next ("💬 What should KaiseHo tell her?"), per chat, 15 min.
type Pending = { kind: "tell" | "story" | "confirm_tell"; elderId: string; text?: string; at: number };
const pending = new Map<string, Pending>();
const takePending = (chatId: string) => {
  const p = pending.get(chatId);
  pending.delete(chatId);
  return p && Date.now() - p.at < 15 * 60_000 ? p : undefined;
};

// HTML of messages we sent, so a tap can edit them without losing formatting.
const sentHtml = new Map<string, string>();
async function send(chatId: string, html: string, buttons?: InlineButton[][], forceReply?: string): Promise<number | null> {
  const id = await sendTelegramMsg(chatId, html, buttons, { forceReply });
  if (id) { sentHtml.set(`${chatId}:${id}`, html); if (sentHtml.size > 500) sentHtml.delete(sentHtml.keys().next().value!); }
  return id;
}
async function edit(chatId: string, messageId: number, html: string, buttons: InlineButton[][] = []) {
  sentHtml.set(`${chatId}:${messageId}`, html);
  return editTelegram(chatId, messageId, html, buttons);
}

interface Ctx { me: Member; elder: Elder; members: Member[]; chatId: string }

async function ctxFor(chatId: string, elderId?: string): Promise<Ctx | null> {
  const repo = getRepo();
  const members = await repo.listMembers(DEMO.familyId);
  const me = members.find((m) => m.telegramChatId === chatId)
    ?? (chatId === env.TELEGRAM_DEMO_CHAT_ID ? members.find((m) => m.role === "primary") : undefined);
  if (!me) return null;
  const elders = await repo.listEldersByFamily(me.familyId);
  const elder = (elderId ? elders.find((e) => e.elderId === elderId) : undefined) ?? elders.find((e) => e.status !== "pending_consent") ?? elders[0];
  return elder ? { me, elder, members, chatId } : null;
}

// ---------------------------------------------------------------- cards

export async function todayCard(elder: Elder): Promise<{ html: string; buttons: InlineButton[][] }> {
  const repo = getRepo();
  const n = elder.preferredName;
  const v = await todayView(elder);
  const today = localDate(elder.tz);
  const lastCall = (await repo.listCalls(elder.elderId)).find((c) => c.status === "completed" && c.summary);
  const open = (await repo.listNeeds(elder.elderId)).filter((x) => x.status === "open");
  const vit = (await vitalsSummary(elder, 1)).kinds.filter((k) => k.latest?.date === today);
  const L: string[] = [`☀️ <b>${esc(n)} today</b>  ·  <i>${dayName(elder.tz)}</i>`, ""];
  const w = v.wellbeing;
  if (w?.mood) L.push(`${MOOD_FACE[w.mood]} <b>Mood</b>   ${dots(w.mood)}  ${MOOD[w.mood]}`);
  if (w?.sleep) L.push(`😴 <b>Sleep</b>   ${SLEEP[w.sleep] ?? w.sleep}`);
  if (v.meds.length) {
    const taken = v.meds.filter((m) => m.status === "taken").length;
    const missed = v.meds.filter((m) => m.status === "missed");
    const later = v.meds.filter((m) => m.status === "pending" || m.status === "unsure").length;
    L.push(`💊 <b>Medicines</b>   ${taken}/${v.meds.length} taken${missed.length ? ` · ✗ ${esc(missed.map((m) => m.name.split(" ")[0]).join(", "))}` : ""}${later ? ` · ⏳ ${later} later` : ""}`);
  }
  if (w?.pain && w.pain.level > 0) L.push(`🦵 <b>Pain</b>   ${esc(w.pain.where)} ${w.pain.level}/10`);
  for (const k of vit) L.push(`🩸 <b>${esc(k.label)}</b>   ${esc(k.latest!.text)}${k.latest!.status !== "normal" ? " ⚠️" : " ✓"}`);
  if (w?.social) L.push(`👥 <b>Company</b>   ${esc(w.social.replace(/_/g, " "))}`);
  if (open.length) L.push(`🛒 <b>Her list</b>   ${esc(open.map((x) => x.item).join(", "))}`);
  if (w?.highlight) L.push("", `✨ <i>“${esc(w.highlight)}”</i>`);
  if (!w && !v.meds.some((m) => m.status !== "pending")) L.push(`<i>No check-in yet today. KaiseHo calls ${esc(n)} at ${esc(elder.callTimeLocal)}.</i>`);
  if (lastCall?.summary) {
    const at = lastCall.startedAt ? new Date(lastCall.startedAt) : new Date();
    L.push("", `📞 <b>Latest check-in</b> · ${dayName(elder.tz, at)}, ${hm(elder.tz, at)}${lastCall.durationSec ? ` · ${Math.max(1, Math.round(lastCall.durationSec / 60))} min` : ""}`, esc(sentences(lastCall.summary.family_en, 2)));
  }
  const buttons: InlineButton[][] = [
    [{ text: `📞 Call ${n} now`, callback_data: `ca:${elder.elderId}` }, { text: `💬 Message ${n}`, callback_data: `rp:${elder.elderId}` }],
    [{ text: `🛒 List${open.length ? ` (${open.length})` : ""}`, callback_data: `nl:${elder.elderId}` }, { text: "💊 Meds", callback_data: `md:${elder.elderId}` }, { text: "📖 Story", callback_data: `sq:${elder.elderId}` }],
  ];
  return { html: L.join("\n"), buttons };
}

/** After every completed call: the one message a busy child actually reads. */
export async function callCard(elder: Elder, call: Call): Promise<{ html: string; buttons: InlineButton[][] }> {
  const repo = getRepo();
  const n = elder.preferredName;
  const ci = await repo.getCheckIn(elder.elderId, call.callId);
  const v = await todayView(elder);
  const open = (await repo.listNeeds(elder.elderId)).filter((x) => x.status === "open");
  const s = call.summary!;
  const mins = call.durationSec ? Math.max(1, Math.round(call.durationSec / 60)) : null;
  const bits: string[] = [];
  if (ci?.mood) bits.push(`${MOOD_FACE[ci.mood]} ${MOOD[ci.mood]}`);
  if (ci?.sleep) bits.push(`😴 ${SLEEP[ci.sleep] ?? ci.sleep}`);
  if (v.meds.length) bits.push(`💊 ${v.meds.filter((m) => m.status === "taken").length}/${v.meds.length}`);
  const L = [
    `📞 <b>${esc(n)}'s check-in is done</b>`,
    `<i>${hm(elder.tz, call.startedAt ? new Date(call.startedAt) : new Date())}${mins ? ` · ${mins} min` : ""}${call.reason === "consent" ? " · welcome call" : ""}</i>`,
    "",
    esc(sentences(s.family_en, 3)),
  ];
  if (bits.length) L.push("", bits.join("  ·  "));
  if (ci?.highlight) L.push(`✨ <i>“${esc(ci.highlight)}”</i>`);
  const flags = s.flags;
  if (flags.length) L.push("", `⚠️ <b>Worth a look:</b> ${esc(flags.map((f) => f.evidence).join(" · ").slice(0, 200))}`);
  const buttons: InlineButton[][] = [
    [{ text: `💬 Reply to ${n}`, callback_data: `rp:${elder.elderId}` }, { text: "☎️ I'll call her", callback_data: `called:${elder.elderId}` }],
    [{ text: "☀️ Full day", callback_data: `td:${elder.elderId}` }, ...(open.length ? [{ text: `🛒 List (${open.length})`, callback_data: `nl:${elder.elderId}` }] : [])],
  ];
  return { html: L.join("\n"), buttons };
}

export async function sendCallCard(elder: Elder, call: Call): Promise<void> {
  if (!call.summary || call.reason === "quicktest") return;
  const card = await callCard(elder, call);
  const members = (await getRepo().listMembers(elder.familyId)).filter((m) => m.role === "primary" || m.role === "secondary");
  for (const m of members) {
    const chatId = m.telegramChatId ?? (m.role === "primary" ? env.TELEGRAM_DEMO_CHAT_ID : undefined);
    if (chatId) await send(chatId, card.html, card.buttons);
  }
}

async function needsCard(elder: Elder, me: Member): Promise<{ html: string; buttons: InlineButton[][] }> {
  const needs = (await getRepo().listNeeds(elder.elderId)).filter((x) => x.status !== "done" || Date.now() - Date.parse(x.updatedAt) < 3 * 86400_000).slice(0, 10);
  const n = elder.preferredName;
  const L = [`🛒 <b>${esc(n)}'s list</b>`, ""];
  if (!needs.length) L.push("<i>Nothing on the list. KaiseHo adds things when she mentions them in a call.</i>");
  for (const x of needs) {
    const who = x.claimedBy?.replace(/^family:\w+$/, "family");
    L.push(x.status === "open" ? `⬜ ${esc(x.item)}${x.urgency === "soon" ? " · <b>soon</b>" : ""}` : x.status === "claimed" ? `🙋 ${esc(x.item)} · <i>${esc(who ?? "")} is arranging</i>` : `✅ <s>${esc(x.item)}</s> · ${esc(who ?? "done")}`);
  }
  const gas = gasStatus(elder);
  if (gas && gas.daysLeft <= 10) L.push("", `⛽ Gas cylinder: refilled ${gas.daysSince} days ago, usually lasts ~${gas.intervalDays}.`);
  L.push("", `<i>Tap an item to take it. ${esc(n)} hears who's arranging it in her next call.</i>`);
  const rows: InlineButton[][] = [];
  for (const x of needs) {
    if (x.status === "open") rows.push([{ text: `🙋 I'll get: ${x.item}`.slice(0, 60), callback_data: `nc:${elder.elderId}:${x.needId}` }]);
    else if (x.status === "claimed" && x.claimedBy === me.name) rows.push([{ text: `✅ Done: ${x.item}`.slice(0, 60), callback_data: `nd:${elder.elderId}:${x.needId}` }]);
  }
  return { html: L.join("\n"), buttons: rows.slice(0, 8) };
}

async function medsCard(elder: Elder): Promise<{ html: string; buttons: InlineButton[][] }> {
  const v = await todayView(elder);
  const n = elder.preferredName;
  const L = [`💊 <b>${esc(n)}'s medicines today</b>`, ""];
  if (!elder.privacy.shareMedicines) L.push(`<i>${esc(n)} chose to keep medicines private.</i>`);
  const ICON: Record<string, string> = { taken: "✅", missed: "✗", unsure: "❔", pending: "⏳" };
  const SLOT: Record<string, string> = { morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" };
  for (const m of v.meds) L.push(`${ICON[m.status]} ${esc(m.name)} · ${SLOT[m.slot] ?? m.slot}${m.status === "pending" ? " <i>(not asked yet)</i>" : ""}`);
  if (v.adherence14d !== null) L.push("", `📈 Last 14 days: <b>${v.adherence14d}%</b> of doses taken`);
  const low = (await refills(elder)).filter((r) => r.daysLeft <= 7);
  if (low.length) L.push(`🔁 Refill soon: ${esc(low.map((r) => `${r.name} (${r.daysLeft} days left)`).join(", "))}`);
  return { html: L.join("\n"), buttons: [[{ text: "☀️ Today", callback_data: `td:${elder.elderId}` }, { text: "🛒 List", callback_data: `nl:${elder.elderId}` }]] };
}

function storyPicker(elder: Elder): { html: string; buttons: InlineButton[][] } {
  const n = elder.preferredName;
  const picks = STORY_BANK.slice(0, 18).sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    html: `📖 <b>What would you like to hear from ${esc(n)}?</b>\n\nPick a question or write your own. KaiseHo asks it in her next call and sends you the story here.`,
    buttons: [...picks.map((b) => [{ text: b.en.slice(0, 60), callback_data: `sb:${elder.elderId}:${b.id}` }]), [{ text: "✍️ Write my own question", callback_data: `sw:${elder.elderId}` }]],
  };
}

function helpCard(ctx: Ctx): { html: string; buttons: InlineButton[][] } {
  const n = esc(ctx.elder.preferredName);
  return {
    html: [
      `🙏 <b>Namaste ${esc(ctx.me.name)}!</b>`,
      `I'm KaiseHo. I call ${n} every day at ${esc(ctx.elder.callTimeLocal)} and tell you here how she is.`,
      "",
      `☀️ /today: how ${n} is right now`,
      `💬 /tell: a message she hears in her next call`,
      `🛒 /needs: her list (tap to take an item)`,
      `💊 /meds: today's medicines and refills`,
      `⏰ /remind tomorrow 9am eye drops`,
      `📖 /story: ask her for a story from her life`,
      `🗓️ /away: pause calls while she travels`,
      `🎧 /digest: this week's audio digest`,
      "",
      `<i>Tip: just type or send a voice note and I'll offer to pass it to ${n}.</i>`,
    ].join("\n"),
    buttons: [
      [{ text: "☀️ Today", callback_data: `td:${ctx.elder.elderId}` }, { text: `💬 Message ${ctx.elder.preferredName}`, callback_data: `rp:${ctx.elder.elderId}` }],
      [{ text: "🛒 Her list", callback_data: `nl:${ctx.elder.elderId}` }, { text: "📖 Ask a story", callback_data: `sq:${ctx.elder.elderId}` }],
    ],
  };
}

// ---------------------------------------------------------------- actions

async function queueMessage(ctx: Ctx, text: string, kind: "text" | "voice" = "text") {
  const repo = getRepo();
  const msg = { elderId: ctx.elder.elderId, messageId: newId("msg"), direction: "to_elder" as const, fromName: ctx.me.name, relation: ctx.me.relation, kind, text: redactPII(text).slice(0, 300), delivered: false, createdAt: nowIso() };
  await repo.putMessage(msg);
  emit("message.queued", ctx.elder.familyId, { message: msg, label: `💬 ${ctx.me.name} → ${ctx.elder.preferredName} (Telegram)` }, ctx.elder.elderId);
  return msg;
}

/** "/remind tomorrow 9am eye drops", "/remind 18:30 BP tablet", "/remind in 2 hours call Priya". */
export function parseRemind(input: string, tz: string, now = new Date()): { when: Date; what: string } | null {
  let t = input.trim();
  const rel = t.match(/^in\s+(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)\b\s*(.*)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const ms = /^h/i.test(rel[2]) ? n * 3600_000 : n * 60_000;
    return rel[3].trim().length >= 2 ? { when: new Date(now.getTime() + ms), what: rel[3].trim() } : null;
  }
  let dayOffset: number | null = null;
  const d = t.match(/^(today|tonight|aaj|tomorrow|tmrw|kal)\b\s*/i);
  if (d) { dayOffset = /^(tomorrow|tmrw|kal)$/i.test(d[1]) ? 1 : 0; t = t.slice(d[0].length); }
  const tm = t.match(/^(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b\s*/i);
  if (!tm) return null;
  let h = Number(tm[1]);
  const min = Number(tm[2] ?? 0);
  const ap = tm[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && d && /tonight/i.test(d[1]) && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  const what = t.slice(tm[0].length).trim();
  if (what.length < 2) return null;
  const today = localDate(tz, now);
  const pad = (x: number) => String(x).padStart(2, "0");
  let when = localToUtc(`${addDays(today, dayOffset ?? 0)}T${pad(h)}:${pad(min)}:00`, tz);
  if (dayOffset === null && when.getTime() < now.getTime()) when = localToUtc(`${addDays(today, 1)}T${pad(h)}:${pad(min)}:00`, tz);
  return { when, what };
}

async function setAway(ctx: Ctx, days: number): Promise<string> {
  const repo = getRepo();
  const e = ctx.elder;
  const n = e.preferredName;
  if (days <= 0) {
    e.status = "active"; e.pausedUntil = undefined;
  } else {
    e.status = "paused"; e.pausedUntil = addDays(localDate(e.tz), days + 1);
  }
  await repo.putElder(e);
  emit("schedule.updated", e.familyId, { status: e.status, pausedUntil: e.pausedUntil, callTimeLocal: e.callTimeLocal, by: ctx.me.name, label: `🗓️ ${ctx.me.name} ${days ? `paused calls until ${e.pausedUntil}` : "resumed daily calls"} (Telegram)` }, e.elderId);
  return days <= 0
    ? `▶️ <b>Daily calls are back on.</b> KaiseHo calls ${esc(n)} at ${esc(e.callTimeLocal)}.`
    : `🗓️ <b>Calls paused.</b> No calls for ${days === 1 ? "a day" : `${days} days`}; they restart on ${new Date(`${e.pausedUntil}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}.\n<i>Scam and emergency protection don't need calls and stay on.</i>`;
}

async function sendDigest(ctx: Ctx): Promise<void> {
  const d = (await getRepo().listDigests(ctx.elder.elderId)).at(-1);
  if (!d) { await send(ctx.chatId, `🎧 No digest yet. It arrives every Sunday at 8 PM: a 60-second spoken update on ${esc(ctx.elder.preferredName)}'s week.`); return; }
  const mp3 = d.audio ? await readAudio(d.audio.file) : null;
  const caption = `🎧 <b>This week with ${esc(ctx.elder.preferredName)}</b> (${d.weekStart.slice(5)} → ${d.weekEnd.slice(5)})`;
  if (mp3) await sendTelegramAudio(ctx.chatId, mp3, `this-week-with-${ctx.elder.preferredName.toLowerCase()}.mp3`, caption);
  else await send(ctx.chatId, `${caption}\n\n${esc(d.script)}`);
}

async function storiesCard(ctx: Ctx): Promise<void> {
  const n = ctx.elder.preferredName;
  if (!ctx.elder.privacy.shareMemories) { await send(ctx.chatId, `📖 ${esc(n)} chose to keep her stories private.`); return; }
  const stories = (await getRepo().listStories(ctx.elder.elderId)).slice(0, 3);
  if (!stories.length) { await send(ctx.chatId, `📖 No stories yet. Ask ${esc(n)} for one with /story.`, storyPicker(ctx.elder).buttons); return; }
  const L = [`📖 <b>From ${esc(n)}'s story book</b>`];
  for (const s of stories) L.push("", `<b>${esc(s.title)}</b>${s.era ? ` · <i>${esc(s.era)}</i>` : ""}`, `<i>“${esc(s.text.length > 260 ? `${s.text.slice(0, 257)}…` : s.text)}”</i>`);
  await send(ctx.chatId, L.join("\n"), [[{ text: "📖 Ask her another", callback_data: `sq:${ctx.elder.elderId}` }]]);
}

// ---------------------------------------------------------------- update handler

type TgUpdate = {
  message?: { message_id: number; chat: { id: number }; text?: string; voice?: { file_id: string; duration?: number; mime_type?: string }; reply_to_message?: { text?: string }; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number }; text?: string }; from?: { first_name?: string } };
};

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  const m = update.message;
  if (!m) return;
  const chatId = String(m.chat.id);
  const text = (m.text ?? "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.toLowerCase() ?? "";
    const repo = getRepo();
    const memberId = LINK_CODES[code];
    const member = memberId ? (await repo.listMembers(DEMO.familyId)).find((x) => x.memberId === memberId) : undefined;
    if (member) { member.telegramChatId = chatId; await repo.putMember(member); }
    const ctx = await ctxFor(chatId);
    if (!ctx) { await send(chatId, "🙏 <b>Welcome to KaiseHo.</b>\nOpen the family dashboard, tap <b>Link Telegram</b> to get your code, then send <code>/start your-code</code>."); return; }
    const h = helpCard(ctx);
    await send(chatId, `${member ? "✅ <b>Linked!</b> " : ""}${h.html}`, h.buttons);
    return;
  }

  const ctx = await ctxFor(chatId);
  if (!ctx) { await send(chatId, "🔗 This chat isn't linked yet. Send <code>/start your-code</code> (from the dashboard's Family page)."); return; }
  const n = ctx.elder.preferredName;

  if (m.voice) {
    const audio = await getTelegramFile(m.voice.file_id);
    const said = audio ? await llmTranscribe({ mimeType: m.voice.mime_type ?? "audio/ogg", base64: audio.toString("base64") }, `A family member's short voice note for ${n}`) : null;
    if (!said) { await send(chatId, `🎙️ I couldn't make out the voice note right now. Type the message and I'll pass it to ${esc(n)} in her next call.`); return; }
    pending.set(chatId, { kind: "confirm_tell", elderId: ctx.elder.elderId, text: said, at: Date.now() });
    await send(chatId, `🎙️ I heard:\n<i>“${esc(said)}”</i>\n\nShall KaiseHo tell ${esc(n)} this in her next call?`, [[{ text: `✅ Yes, tell ${n}`, callback_data: "ty" }, { text: "✖ No", callback_data: "tn" }]]);
    return;
  }

  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw?.startsWith("/") ? cmdRaw.slice(1).split("@")[0].toLowerCase() : "";
  const arg = rest.join(" ").trim();

  if (!cmd && text) {
    const p = takePending(chatId);
    if (p?.kind === "tell" || (!p && m.reply_to_message?.text?.startsWith("💬"))) {
      const msg = await queueMessage(ctx, text);
      await send(chatId, `✅ <b>Saved for ${esc(n)}.</b> KaiseHo will say it warmly in her next call (${esc(ctx.elder.callTimeLocal)}) and tell you when she's heard it.\n<i>“${esc(msg.text)}”</i>`);
      return;
    }
    if (p?.kind === "story") {
      try {
        const ask = await askStory(ctx.elder, text, ctx.me.name);
        await send(chatId, `📖 <b>Done!</b> KaiseHo will ask ${esc(n)} in her next call:\n<i>“${esc(ask.question)}”</i>\nYou'll get her story right here.`);
      } catch (err) { await send(chatId, `📖 ${esc((err as Error).message)}`); }
      return;
    }
    pending.set(chatId, { kind: "confirm_tell", elderId: ctx.elder.elderId, text, at: Date.now() });
    await send(chatId, `💬 Send this to ${esc(n)} in her next call?\n\n<i>“${esc(text.slice(0, 300))}”</i>`, [[{ text: `✅ Yes, tell ${n}`, callback_data: "ty" }, { text: "✖ No", callback_data: "tn" }]]);
    return;
  }

  switch (cmd) {
    case "today": { const c = await todayCard(ctx.elder); await send(chatId, c.html, c.buttons); return; }
    case "needs": case "list": { const c = await needsCard(ctx.elder, ctx.me); await send(chatId, c.html, c.buttons); return; }
    case "meds": { const c = await medsCard(ctx.elder); await send(chatId, c.html, c.buttons); return; }
    case "call": await send(chatId, `📞 <b>Call ${esc(n)} now?</b>\nKaiseHo will ring her in a few seconds and send you the summary when the call ends.`, [[{ text: "✅ Yes, call now", callback_data: `cy:${ctx.elder.elderId}` }, { text: "✖ Not now", callback_data: "cx" }]]); return;
    case "tell": case "msg":
      if (arg) { const msg = await queueMessage(ctx, arg); await send(chatId, `✅ <b>Saved for ${esc(n)}.</b> She'll hear it in her next call:\n<i>“${esc(msg.text)}”</i>`); return; }
      pending.set(chatId, { kind: "tell", elderId: ctx.elder.elderId, at: Date.now() });
      await send(chatId, `💬 What should KaiseHo tell ${esc(n)}? Type it below.`, undefined, `Message for ${n}`); return;
    case "remind": {
      const r = arg ? parseRemind(arg, ctx.elder.tz) : null;
      if (!r) { await send(chatId, "⏰ Try: <code>/remind tomorrow 9am eye drops</code>, <code>/remind 18:30 BP tablet</code> or <code>/remind in 2 hours call Priya</code>"); return; }
      try {
        const rem = await createReminder(ctx.elder, { kind: "reminder", text: redactPII(r.what), when: r.when, createdBy: `family:${ctx.me.memberId}` });
        await send(chatId, `⏰ <b>Reminder set.</b> KaiseHo will call ${esc(n)} ${esc(rem.whenSpoken)}:\n<i>“${esc(rem.text)}”</i>`, [[{ text: "✖ Cancel it", callback_data: `rc:${ctx.elder.elderId}:${rem.reminderId}` }]]);
      } catch (err) { await send(chatId, `⏰ ${esc((err as Error).message)}`); }
      return;
    }
    case "story": case "ask":
      if (arg) {
        try { const ask = await askStory(ctx.elder, arg, ctx.me.name); await send(chatId, `📖 <b>Done!</b> KaiseHo will ask ${esc(n)} in her next call:\n<i>“${esc(ask.question)}”</i>`); }
        catch (err) { await send(chatId, `📖 ${esc((err as Error).message)}`); }
        return;
      }
      { const c = storyPicker(ctx.elder); await send(chatId, c.html, c.buttons); return; }
    case "stories": await storiesCard(ctx); return;
    case "away": case "pause":
      await send(chatId, `🗓️ <b>Pause ${esc(n)}'s daily calls?</b>\nUseful when she's travelling or staying with you.${ctx.elder.status === "paused" && ctx.elder.pausedUntil ? `\n<i>Currently paused until ${esc(ctx.elder.pausedUntil)}.</i>` : ""}`, [
        [{ text: "Tomorrow", callback_data: `aw:${ctx.elder.elderId}:1` }, { text: "3 days", callback_data: `aw:${ctx.elder.elderId}:3` }, { text: "1 week", callback_data: `aw:${ctx.elder.elderId}:7` }],
        [{ text: "▶️ Resume calls", callback_data: `aw:${ctx.elder.elderId}:0` }],
      ]); return;
    case "digest": await sendDigest(ctx); return;
    case "brain": case "mind": {
      const s = await mindSummary(ctx.elder);
      await send(chatId, `🧩 <b>${esc(n)}'s mind gym</b>\n${esc(s.headline)}\n${s.kinds.filter((k) => k.played).map((k) => `• ${esc(k.label)}: ${k.recentAvg ?? "–"}% lately${k.usualAvg !== null ? ` (usual ${k.usualAvg}%)` : ""}`).join("\n")}\n<i>${esc(s.note)}</i>`);
      return;
    }
    default: { const h = helpCard(ctx); await send(chatId, h.html, h.buttons); }
  }
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>): Promise<void> {
  const chatId = String(cb.message?.chat.id ?? "");
  const msgId = cb.message?.message_id ?? 0;
  const [action, a1, a2] = (cb.data ?? "").split(":");
  const repo = getRepo();
  try {
    // Alert-scoped actions carry the alert id; find its elder first.
    const alert = ["ack", "nh", "lv"].includes(action) && a1 ? await repo.getAlert(a1) : undefined;
    const ctx = await ctxFor(chatId, alert?.elderId ?? (a1?.startsWith("eld_") ? a1 : undefined));
    if (!ctx) { await answerCallback(cb.id, "This chat isn't linked yet. Send /start your-code."); return; }
    const { elder, me } = ctx;
    const n = elder.preferredName;
    const now = hm(elder.tz);
    const pressedHtml = sentHtml.get(`${chatId}:${msgId}`) ?? (alert ? alertHtml.get(alert.alertId) : undefined) ?? esc(cb.message?.text ?? "");

    switch (action) {
      case "ack": {
        if (!alert) break;
        if (alert.status !== "open") { await answerCallback(cb.id, `Already handled by ${alert.ackedBy?.replace("family:mem_", "") ?? "the family"} ✓`); return; }
        await ackAlert(alert.alertId, `family:${me.memberId}`);
        const loud = alert.severity === "urgent" || alert.severity === "emergency";
        const footer = `✅ <b>${esc(me.name)}</b> ${loud ? "is on it" : "has seen this"} · ${now}`;
        const buttons = loud ? [[{ text: `📞 Call ${n} now`, callback_data: `ca:${elder.elderId}` }]] : [];
        const edited = await refreshAlertCopies(alert, elder, footer, buttons);
        if (!edited && msgId) await edit(chatId, msgId, `${pressedHtml}\n\n${footer}`, buttons);
        await answerCallback(cb.id, loud ? "Thank you. The whole family can see you're on it." : "Marked as seen ✓");
        return;
      }
      case "ca": case "callnow":
        await send(chatId, `📞 <b>Call ${esc(n)} now?</b>\nKaiseHo will ring her in a few seconds and send you the summary when the call ends.`, [[{ text: "✅ Yes, call now", callback_data: `cy:${elder.elderId}` }, { text: "✖ Not now", callback_data: "cx" }]]);
        await answerCallback(cb.id, "");
        return;
      case "cy": {
        const live = (await repo.listCalls(elder.elderId)).find((c) => (c.status === "ringing" || c.status === "in_progress") && Date.now() - Date.parse(c.startedAt ?? "") < 6 * 60_000);
        if (live) { await answerCallback(cb.id, `KaiseHo is already on a call with ${n} 📞`); return; }
        await callElder(elder, "checkin");
        await edit(chatId, msgId, `📞 <b>Calling ${esc(n)} now…</b>\n<i>Requested by ${esc(me.name)} · ${now}. The summary will arrive here when the call ends.</i>`);
        await answerCallback(cb.id, `Calling ${n} 📞`);
        return;
      }
      case "cx": await edit(chatId, msgId, "👍 Okay, not calling now."); await answerCallback(cb.id, ""); return;
      case "called":
        await logFamilyCall(elder, me.name, "button");
        if (msgId) await edit(chatId, msgId, `${pressedHtml}\n\n☎️ <b>${esc(me.name)}</b> is calling ${esc(n)} · ${now}`);
        await answerCallback(cb.id, `Lovely ❤️ Logged your call with ${n}.`);
        return;
      case "rp":
        pending.set(chatId, { kind: "tell", elderId: elder.elderId, at: Date.now() });
        await send(chatId, `💬 What should KaiseHo tell ${esc(n)}? Type it below.`, undefined, `Message for ${n}`);
        await answerCallback(cb.id, "");
        return;
      case "ty": {
        const p = takePending(chatId);
        if (!p?.text) { await answerCallback(cb.id, "That message expired. Just type it again."); return; }
        const msg = await queueMessage(ctx, p.text);
        await edit(chatId, msgId, `✅ <b>Saved for ${esc(n)}.</b> She'll hear it in her next call (${esc(elder.callTimeLocal)}).\n<i>“${esc(msg.text)}”</i>`);
        await answerCallback(cb.id, "Saved ✓");
        return;
      }
      case "tn": takePending(chatId); await edit(chatId, msgId, "👍 Okay, not sent."); await answerCallback(cb.id, ""); return;
      case "td": { const c = await todayCard(elder); await send(chatId, c.html, c.buttons); await answerCallback(cb.id, ""); return; }
      case "md": { const c = await medsCard(elder); await send(chatId, c.html, c.buttons); await answerCallback(cb.id, ""); return; }
      case "nl": { const c = await needsCard(elder, me); await send(chatId, c.html, c.buttons); await answerCallback(cb.id, ""); return; }
      case "nh": case "needs": {
        const ids = (alert?.data.needIds as string[] | undefined) ?? (await repo.listNeeds(elder.elderId)).filter((x) => x.status === "open").map((x) => x.needId);
        const claimed: string[] = [];
        for (const id of ids) { const x = await repo.getNeed(elder.elderId, id); if (x?.status === "open") { await claimNeed(elder, id, me.name); claimed.push(x.item); } }
        if (!claimed.length) { await answerCallback(cb.id, "Already covered by the family ✓"); return; }
        const footer = `🙋 <b>${esc(me.name)}</b> is arranging: ${esc(claimed.join(", "))} · ${now}`;
        const buttons = [[{ text: "🛒 See the list", callback_data: `nl:${elder.elderId}` }]];
        const edited = alert ? await refreshAlertCopies(alert, elder, footer, buttons) : 0;
        if (!edited && msgId) await edit(chatId, msgId, `${pressedHtml}\n\n${footer}`, buttons);
        await answerCallback(cb.id, `Thank you ❤️ ${n} will hear that you're arranging it.`);
        return;
      }
      case "nc": case "nd": {
        if (!a2) break;
        const x = action === "nc" ? await claimNeed(elder, a2, me.name) : await completeNeed(elder, a2, me.name);
        const c = await needsCard(elder, me);
        await edit(chatId, msgId, c.html, c.buttons);
        await answerCallback(cb.id, action === "nc" ? `You're getting ${x.item} 🙋` : `${x.item}: done ✅`);
        return;
      }
      case "sq": { const c = storyPicker(elder); await send(chatId, c.html, c.buttons); await answerCallback(cb.id, ""); return; }
      case "sb": {
        const b = STORY_BANK.find((x) => x.id === a2);
        if (!b) break;
        const ask = await askStory(elder, b.en, me.name);
        await edit(chatId, msgId, `📖 <b>Done!</b> KaiseHo will ask ${esc(n)} in her next call:\n<i>“${esc(ask.question)}”</i>\nYou'll get her story right here.`);
        await answerCallback(cb.id, "Question saved 📖");
        return;
      }
      case "sw":
        pending.set(chatId, { kind: "story", elderId: elder.elderId, at: Date.now() });
        await send(chatId, `✍️ What would you like ${esc(n)} to tell you about? Type your question.`, undefined, "e.g. How did you learn to cook?");
        await answerCallback(cb.id, "");
        return;
      case "lv": {
        if (!alert) break;
        const title = String(alert.title.split(": ").slice(1).join(": ") || "your story");
        await queueMessage(ctx, `${me.name} read your story "${title}" and loved it ❤️`);
        await edit(chatId, msgId, `${pressedHtml}\n\n❤️ <b>${esc(me.name)}</b> loved it · ${n} will hear that in her next call`, [[{ text: "📖 Ask her another", callback_data: `sq:${elder.elderId}` }]]);
        await answerCallback(cb.id, `❤️ ${n} will hear that you loved it.`);
        return;
      }
      case "aw": {
        const html = await setAway(ctx, Number(a2 ?? 0));
        await edit(chatId, msgId, html);
        await answerCallback(cb.id, Number(a2) ? "Calls paused 🗓️" : "Calls resumed ▶️");
        return;
      }
      case "rc": {
        if (!a2) break;
        const { cancelReminder } = await import("./reminders");
        await cancelReminder(elder, a2, `family:${me.memberId}`);
        await edit(chatId, msgId, `${pressedHtml}\n\n✖ <i>Cancelled by ${esc(me.name)}</i>`);
        await answerCallback(cb.id, "Reminder cancelled");
        return;
      }
    }
    await answerCallback(cb.id, "Done ✓");
  } catch (err) {
    console.warn("[telegram] callback failed", action, (err as Error).message);
    await answerCallback(cb.id, (err as Error).message.slice(0, 180), true);
  }
}

