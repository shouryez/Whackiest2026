import { env } from "../../env";

/**
 * Telegram Bot API (plan.md Section 12.5): alerts with inline buttons, /start linking and
 * button callbacks arrive on /webhooks/telegram/<secret>.
 */
export type InlineButton = { text: string; callback_data?: string; url?: string };

export function telegramEnabled(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

async function tg(method: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: Record<string, unknown>; description?: string };
    if (!res.ok || !body.ok) {
      console.warn(`[telegram] ${method} failed`, res.status, body.description ?? "");
      return null;
    }
    return body.result ?? {};
  } catch (err) {
    console.warn(`[telegram] ${method} error`, (err as Error).message);
    return null;
  }
}

/** Sends a message and returns its message_id (null on failure), so taps can edit it in place later. */
export async function sendTelegramMsg(chatId: string, html: string, buttons?: InlineButton[][], opts: { forceReply?: string } = {}): Promise<number | null> {
  const r = await tg("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : opts.forceReply ? { reply_markup: { force_reply: true, input_field_placeholder: opts.forceReply.slice(0, 64) } } : {}),
  });
  return r && typeof r.message_id === "number" ? r.message_id : r ? 0 : null;
}

export async function sendTelegram(chatId: string, html: string, buttons?: InlineButton[][]): Promise<boolean> {
  return (await sendTelegramMsg(chatId, html, buttons)) !== null;
}

/** Edits a message the bot sent (text + buttons). An empty button list removes the buttons. */
export async function editTelegram(chatId: string, messageId: number, html: string, buttons: InlineButton[][] = []): Promise<boolean> {
  const r = await tg("editMessageText", {
    chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons },
  });
  return r !== null;
}

export async function setTelegramCommands(commands: { command: string; description: string }[]): Promise<boolean> {
  return (await tg("setMyCommands", { commands })) !== null;
}

/** Downloads a file a user sent (voice notes). */
export async function getTelegramFile(fileId: string): Promise<Buffer | null> {
  const f = await tg("getFile", { file_id: fileId });
  const path = f && typeof f.file_path === "string" ? f.file_path : null;
  if (!path || !env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`, { signal: AbortSignal.timeout(10000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** sendAudio with an MP3 upload (weekly digest). */
export async function sendTelegramAudio(chatId: string, mp3: Buffer, filename: string, caption: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1000));
    form.append("parse_mode", "HTML");
    form.append("title", "This week with Amma");
    form.append("audio", new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), filename);
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendAudio`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!res.ok) console.warn("[telegram] sendAudio failed", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.warn("[telegram] sendAudio error", (err as Error).message);
    return false;
  }
}

export async function answerCallback(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  await tg("answerCallbackQuery", { callback_query_id: callbackQueryId, text: text.slice(0, 190), show_alert: showAlert });
}

export async function setTelegramWebhook(url: string): Promise<boolean> {
  return (await tg("setWebhook", { url, allowed_updates: ["message", "callback_query"] })) !== null;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
