import { HELPLINES, type Alert, type AlertType, type Elder, type Member, type Severity } from "@kaiseho/shared";
import { redactDeep } from "../../control/redact";
import { env } from "../../env";
import { emit } from "../../engine/events";
import { newId, nowIso } from "../../engine/ids";
import { escapeHtml, sendTelegram } from "../../engine/notify/telegram";
import { getRepo } from "../../repo";

/**
 * Alert routing (plan.md Section 12.4).
 *  info / watch  → dashboard (daily Telegram digest comes in Phase 2)
 *  urgent        → instant Telegram to primary (+ secondary for scams)
 *  emergency     → instant Telegram to everyone (+ briefing calls in Phase 3)
 */
const SEVERITY_ICON: Record<Severity, string> = { info: "ℹ️", watch: "👀", urgent: "🚨", emergency: "🆘" };

function recipients(members: Member[], severity: Severity, type: AlertType, to?: string[]): Member[] {
  if (severity === "emergency") return members;
  // A message from the elder is delivered to whoever she addressed, whatever its severity.
  if (type === "message") return members.filter((m) => m.role !== "neighbour" && (!to || to.includes(m.name)));
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

function formatTelegram(a: Alert, elder: Elder, extraLines: string[]): string {
  const head = `${SEVERITY_ICON[a.severity]} <b>${a.severity.toUpperCase()} · ${escapeHtml(a.title)}</b>`;
  const lines = [head, escapeHtml(a.body), ...extraLines.map(escapeHtml)];
  lines.push("", `<i>KaiseHo · ${escapeHtml(elder.preferredName)} · Elderline ${HELPLINES.elderline}</i>`);
  return lines.join("\n");
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
  void Promise.all(
    targets.map(async (m) => {
      const chatId = chatIdFor(m);
      const buttons = alert.severity === "urgent" || alert.severity === "emergency"
        ? [[{ text: "✓ Acknowledge", callback_data: `ack:${alert.alertId}` }, { text: `📞 Call ${input.elder.preferredName} now`, callback_data: `callnow:${alert.elderId}` }]]
        : alert.type === "message" ? [[{ text: "☎️ I called her", callback_data: `called:${alert.elderId}` }]] : undefined;
      const ok = chatId ? await sendTelegram(chatId, text, buttons) : false;
      const channel = `telegram:${m.name}`;
      if (ok) alert.notifiedVia.push(channel);
      emit("alert.notified", alert.familyId, {
        alertId: alert.alertId, to: m.name, relation: m.relation, channel: "telegram",
        status: ok ? "delivered" : chatId ? "failed" : "not_linked",
      }, alert.elderId);
    }),
  ).then(() => repo.putAlert(alert));

  return alert;
}

export async function ackAlert(alertId: string, by: string): Promise<Alert | undefined> {
  const repo = getRepo();
  const a = await repo.getAlert(alertId);
  if (!a) return undefined;
  a.status = "acked";
  a.ackedBy = by;
  await repo.putAlert(a);
  emit("alert.acked", a.familyId, { alertId, by }, a.elderId);
  return a;
}
