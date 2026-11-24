import { env } from "../../env";

/**
 * Telegram Bot API sender (plan.md Section 12.5).
 * Phase 0: plain sendMessage. Phase 2 adds /start linking and inline-button callbacks.
 */
export function telegramEnabled(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegram(chatId: string, html: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn("[telegram] send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[telegram] send error", (err as Error).message);
    return false;
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
