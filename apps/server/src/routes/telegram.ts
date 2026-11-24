import { Hono } from "hono";
import { env } from "../env";
import { answerCallback, escapeHtml, sendTelegram } from "../engine/notify/telegram";
import { ackAlert } from "../packs/kaiseho/alerts";
import { callElder } from "../packs/kaiseho/calls";
import { DEMO } from "../packs/kaiseho/seed";
import { logFamilyCall } from "../packs/kaiseho/nudges";
import { getRepo } from "../repo";

/**
 * Telegram bot webhook (plan.md Section 12.5): /start <code> links a family member's chat;
 * inline buttons → acknowledge_alert / call_now / "I called her".
 * Set it with: POST /internal/telegram/set-webhook (uses PUBLIC_BASE_URL).
 */
export const telegramRoutes = new Hono();

// Link codes (hackathon: fixed per member; production: one-time codes from the dashboard).
const LINK_CODES: Record<string, string> = { ravi: "mem_ravi", priya: "mem_priya" };

telegramRoutes.post("/:secret", async (c) => {
  if (c.req.param("secret") !== env.TELEGRAM_WEBHOOK_SECRET) return c.json({ ok: false }, 404);
  const update = (await c.req.json().catch(() => ({}))) as {
    message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
    callback_query?: { id: string; data?: string; message?: { chat: { id: number } }; from?: { first_name?: string } };
  };
  const repo = getRepo();

  if (update.message?.text?.startsWith("/start")) {
    const code = update.message.text.split(/\s+/)[1]?.toLowerCase() ?? "";
    const memberId = LINK_CODES[code];
    const chatId = String(update.message.chat.id);
    const member = memberId ? (await repo.listMembers(DEMO.familyId)).find((m) => m.memberId === memberId) : undefined;
    if (!member) {
      await sendTelegram(chatId, "🙏 Welcome to KaiseHo. Open the family dashboard and tap <b>Link Telegram</b> to get your code, then send <code>/start your-code</code>.");
    } else {
      member.telegramChatId = chatId;
      await repo.putMember(member);
      await sendTelegram(chatId, `✅ Linked! Hi ${escapeHtml(member.name)}, you'll get KaiseHo updates about Amma here: urgent alerts instantly, nudges when it's a good time to call.`);
    }
    return c.json({ ok: true });
  }

  const cb = update.callback_query;
  if (cb?.data) {
    const [action, id] = cb.data.split(":");
    const chatId = String(cb.message?.chat.id ?? "");
    const members = await repo.listMembers(DEMO.familyId);
    const who = members.find((m) => m.telegramChatId === chatId) ?? members.find((m) => m.role === "primary")!;
    try {
      if (action === "ack") {
        await ackAlert(id, `family:${who.memberId}`);
        await answerCallback(cb.id, "Acknowledged ✓");
      } else if (action === "callnow") {
        const elder = await repo.getElder(id);
        if (elder) await callElder(elder, "checkin");
        await answerCallback(cb.id, "KaiseHo is calling her now 📞");
      } else if (action === "called") {
        const elder = await repo.getElder(id);
        if (elder) await logFamilyCall(elder, who.name, "button");
        await answerCallback(cb.id, "Lovely ❤️ Logged your call.");
      }
    } catch (err) {
      await answerCallback(cb.id, (err as Error).message.slice(0, 180));
    }
  }
  return c.json({ ok: true });
});
