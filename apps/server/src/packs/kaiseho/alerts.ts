import { HELPLINES, type Alert, type AlertType, type Elder, type Member, type Severity } from "@kaiseho/shared";
import { redactDeep } from "../../control/redact";
import { env } from "../../env";
import { emit } from "../../engine/events";
import { newId, nowIso } from "../../engine/ids";
import { editTelegram, escapeHtml, sendTelegramMsg, type InlineButton } from "../../engine/notify/telegram";
import { getRepo } from "../../repo";

/**
 * Alert routing (plan.md Section 12.4).
 *  info / watch  → dashboard (daily Telegram digest comes in Phase 2)
 *  urgent        → instant Telegram to primary (+ secondary for scams)
 *  emergency     → instant Telegram to everyone (+ briefing calls in Phase 3)
 */
const SEVERITY_ICON: Record<Severity, string> = { info: "🔔", watch: "👀", urgent: "🚨", emergency: "🆘" };
const TYPE_ICON: Partial<Record<AlertType, string>> = {
  scam: "🛡️", no_answer: "📵", missed_meds: "💊", low_mood: "💛", refill: "💊", pause: "🗓️", message: "💌", health_change: "🩺",
  appointment: "📅", pension: "🏦", occasion: "🎉", vital: "🩸", need: "🛒", story: "📖", mind: "🧩",
};

function recipients(members: Member[], severity: Severity, type: AlertType, to?: string[]): Member[] {
  if (severity === "emergency") return members;
  // A message from the elder is delivered to whoever she addressed, whatever its severity.
  if (type === "message") return members.filter((m) => m.role !== "neighbour" && (!to || to.includes(m.name)));
  // Practical news (bookings, pension, occasions) goes to the primary contact, whatever its severity.
  if (type === "appointment" || type === "pension" || type === "occasion") return members.filter((m) => m.role === "primary");
  // Household needs: every child, so whoever is free can claim it.
  if (type === "need" || type === "story") return members.filter((m) => m.role === "primary" || m.role === "secondary");
  if (type === "mind") return members.filter((m) => m.role === "primary");
  if (type === "vital" && severity === "watch") return members.filter((m) => m.role === "primary");
  if (severity === "urgent") {
    return members.filter((m) => m.role === "primary" || (m.role === "secondary" && type === "scam"));
  }
  return [];
}

function chatIdFor(m: Member): string | undefined {
  if (m.telegramChatId) return m.telegramChatId;
  // Phase 0 shortcut until /start linking exists: the demo chat stands in for the primary child.
  if (m.role === "primary" && env.TELEGRAM_DEMO_CHAT_ID) return env.TELEGRAM_DEMO_CHAT_ID;
  return undefined;
}

const hm = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);

/** Clean alert card: icon + title, who and when, the body, then the one thing to do. */
export function formatTelegram(a: Alert, elder: Elder, extraLines: string[]): string {
  const loud = a.severity === "urgent" || a.severity === "emergency";
  const icon = loud ? SEVERITY_ICON[a.severity] : TYPE_ICON[a.type] ?? SEVERITY_ICON[a.severity];
  const lines = [`${icon} <b>${loud ? `${a.severity.toUpperCase()} · ` : ""}${escapeHtml(a.title)}</b>`, `<i>${escapeHtml(elder.preferredName)} · ${hm(elder.tz, new Date(a.createdAt))}</i>`, "", escapeHtml(a.body)];
  if (extraLines.length) lines.push("", ...extraLines.map(escapeHtml));
  if (loud) lines.push("", `<i>Helplines: Elderline ${HELPLINES.elderline}${a.type === "scam" ? ` · Cyber fraud ${HELPLINES.cyberFraud}` : ""} · Emergency ${HELPLINES.emergency}</i>`);
  return lines.join("\n");
}

/** The buttons under an alert, by what the family can actually do about it. */
export function alertButtons(a: Alert, elder: Elder): InlineButton[][] | undefined {
  const n = elder.preferredName;
  if (a.severity === "urgent" || a.severity === "emergency") {
    return [[{ text: "🙋 I'm on it", callback_data: `ack:${a.alertId}` }, { text: `📞 Call ${n} now`, callback_data: `ca:${a.elderId}` }]];
  }
  switch (a.type) {
    case "message": return [[{ text: `💬 Reply to ${n}`, callback_data: `rp:${a.elderId}` }, { text: "☎️ I called", callback_data: `called:${a.elderId}` }]];
    case "need": return [[{ text: "🙋 I'll handle it", callback_data: `nh:${a.alertId}` }, { text: "🛒 See the list", callback_data: `nl:${a.elderId}` }]];
    case "story": return [[{ text: "❤️ Loved it", callback_data: `lv:${a.alertId}` }, { text: "📖 Ask another", callback_data: `sq:${a.elderId}` }]];
    case "low_mood": return [[{ text: "☎️ I'll call her", callback_data: `called:${a.elderId}` }, { text: "✓ Seen", callback_data: `ack:${a.alertId}` }]];
    default: return [[{ text: "✓ Got it", callback_data: `ack:${a.alertId}` }]];
  }
}

/** The rendered HTML of each Telegram copy, so a tap can edit every sibling's message. */
export const alertHtml = new Map<string, string>();

/** Updates every family member's copy of an alert (e.g. "✅ Ravi is on it"). */
export async function refreshAlertCopies(a: Alert, elder: Elder, footer: string, buttons: InlineButton[][] = []): Promise<number> {
  const html = alertHtml.get(a.alertId) ?? formatTelegram(a, elder, []);
  let n = 0;
  for (const copy of a.telegram ?? []) if (await editTelegram(copy.chatId, copy.messageId, `${html}\n\n${footer}`, buttons)) n++;
  return n;
}

export async function createAlert(input: {
  elder: Elder;
  severity: Severity;
  type: AlertType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Extra lines appended only to the Telegram text (e.g. "👉 Please call her today"). */
  telegramLines?: string[];
}): Promise<Alert> {
  const repo = getRepo();
  const alert: Alert = {
    familyId: input.elder.familyId,
    alertId: newId("alr"),
    elderId: input.elder.elderId,
    severity: input.severity,
    type: input.type,
    title: input.title,
    body: redactDeep(input.body),
    data: redactDeep(input.data ?? {}),
    status: "open",
    createdAt: nowIso(),
    notifiedVia: ["dashboard"],
  };
  await repo.putAlert(alert);
  emit("alert.created", alert.familyId, { alert }, alert.elderId);

  const members = await repo.listMembers(alert.familyId);
  const to = Array.isArray(input.data?.to) ? (input.data.to as string[]) : undefined;
  const targets = recipients(members, alert.severity, alert.type, to);
  const text = formatTelegram(alert, input.elder, input.telegramLines ?? []);

  // Fan out in parallel; never block the voice tool on Telegram.
  alertHtml.set(alert.alertId, text);
  if (alertHtml.size > 400) alertHtml.delete(alertHtml.keys().next().value!);
  const buttons = alertButtons(alert, input.elder);
  void Promise.all(
    targets.map(async (m) => {
      const chatId = chatIdFor(m);
      const msgId = chatId ? await sendTelegramMsg(chatId, text, buttons) : null;
      const ok = msgId !== null;
      const channel = `telegram:${m.name}`;
      if (ok) alert.notifiedVia.push(channel);
      if (ok && chatId && msgId) (alert.telegram ??= []).push({ chatId, messageId: msgId, member: m.name });
      emit("alert.notified", alert.familyId, {
        alertId: alert.alertId, to: m.name, relation: m.relation, channel: "telegram",
        status: ok ? "delivered" : chatId ? "failed" : "not_linked",
      }, alert.elderId);
    }),
  ).then(async () => {
    // Merge (a sibling may have tapped a button already): keep their status, add the delivery record.
    const cur = (await repo.getAlert(alert.alertId)) ?? alert;
    await repo.putAlert({ ...cur, notifiedVia: alert.notifiedVia, telegram: alert.telegram });
  });

  return alert;
}

export async function ackAlert(alertId: string, by: string): Promise<Alert | undefined> {
  const repo = getRepo();
  const a = await repo.getAlert(alertId);
  if (!a) return undefined;
  a.status = "acked";
  a.ackedBy = by;
  a.ackedAt = nowIso();
  await repo.putAlert(a);
  emit("alert.acked", a.familyId, { alertId, by }, a.elderId);
  return a;
}
