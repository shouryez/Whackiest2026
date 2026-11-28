import { Hono } from "hono";
import { env } from "../env";
import { handleUpdate } from "../packs/kaiseho/telegramBot";

/**
 * Telegram bot webhook (plan.md Section 12.5). All behaviour lives in packs/kaiseho/telegramBot.ts:
 * /start <code> linking, commands, synced buttons, messages and voice notes for her next call.
 * Set it with: POST /internal/telegram/set-webhook (uses PUBLIC_BASE_URL; also sets the command menu).
 */
export const telegramRoutes = new Hono();

telegramRoutes.post("/:secret", async (c) => {
  if (c.req.param("secret") !== env.TELEGRAM_WEBHOOK_SECRET) return c.json({ ok: false }, 404);
  const update = await c.req.json().catch(() => ({}));
  // Answer Telegram fast; the bot replies with its own API calls.
  await handleUpdate(update).catch((err) => console.warn("[telegram] update failed", (err as Error).message));
  return c.json({ ok: true });
});
