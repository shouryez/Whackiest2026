import { HELPLINES, type Alert, type Elder } from "@kaiseho/shared";
import { env } from "../../env";
import { elevenLabsReady, isPlaceholderPhone, placeOutboundCall } from "../../engine/calls";
import { emit } from "../../engine/events";
import { scheduleJob } from "../../engine/jobs";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";

/**
 * Emergency cascade (plan.md Section 8.3, P1-1): in parallel →
 *   urgent Telegram to everyone · Briefing Agent calls the primary child · and the neighbour;
 *   Telegram repeats every 2 min until acknowledged (max 3).
 * Without a briefing agent configured, the calls are shown as "simulated" on Live Ops.
 */
export const KIND_LABEL: Record<string, string> = {
  chest_pain: "chest pain", breathing: "trouble breathing", fall: "a fall", confusion: "sudden confusion",
  bleeding: "heavy bleeding", fainting: "fainting", mental_health: "said they don't want to live", other: "an emergency",
};

export async function briefingCall(elder: Elder, alert: Alert, recipient: { name: string; relation: string; phone?: string }, extra: Record<string, string> = {}): Promise<"calling" | "simulated" | "failed"> {
  const live = elevenLabsReady(env.ELEVENLABS_BRIEFING_AGENT_ID) && !isPlaceholderPhone(recipient.phone) && !extra.simulated;
  emit("briefing.calling", elder.familyId, { alertId: alert.alertId, to: recipient.name, relation: recipient.relation, mode: live ? "live" : "simulated" }, elder.elderId);
  if (!live) return "simulated";
  try {
    await placeOutboundCall({
      agentId: env.ELEVENLABS_BRIEFING_AGENT_ID!,
      toNumber: recipient.phone!,
      dynamicVariables: {
        recipient_name: recipient.name, relation: recipient.relation, elder_preferred_name: elder.preferredName,
        alert_type: alert.type, alert_summary: alert.body, alert_id: alert.alertId, family_id: elder.familyId,
        elder_address: recipient.relation === "neighbour" ? elder.address ?? "" : "",
        recommended_actions: extra.recommended_actions ?? "Please call her right now.",
      },
    });
    return "calling";
  } catch (err) {
    console.warn("[briefing]", (err as Error).message);
    return "failed";
  }
}

/** Job: re-send an emergency alert if nobody has acknowledged it yet. */
export async function repeatEmergency(alertId: string, n: number): Promise<void> {
  const repo = getRepo();
  const a = await repo.getAlert(alertId);
  if (!a || a.status !== "open") return;
  const elder = await repo.getElder(a.elderId);
  if (!elder) return;
  await createAlert({ elder, severity: "emergency", type: "emergency", title: `Reminder ${n}/3: ${a.title}`, body: a.body, data: { ...a.data, repeatOf: a.alertId } });
}

export async function raiseEmergency(elder: Elder, kind: string, details: string, callId?: string) {
  const repo = getRepo();
  const members = await repo.listMembers(elder.familyId);
  const label = KIND_LABEL[kind] ?? kind;
  const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active).map((m) => `${m.name} ${m.dose}`).join(", ");
  const mental = kind === "mental_health";

  const alert = await createAlert({
    elder, severity: "emergency", type: "emergency",
    title: mental ? `${elder.preferredName} needs to hear from you now` : `EMERGENCY: ${elder.preferredName} reported ${label}`,
    body: `${elder.preferredName} told KaiseHo: "${details.slice(0, 200)}". KaiseHo told her to ${mental ? "stay on the line; family is calling her" : "call 112 now and sit down safely"}.`,
    data: { kind, callId, address: elder.address, meds },
    telegramLines: mental
      ? [`👉 Please call her right now. Tele-MANAS (mental health): ${HELPLINES.teleManas}`]
      : [`📍 ${elder.address ?? elder.city}`, `💊 ${meds}`, `👉 Call her now. Emergency: ${HELPLINES.emergency}`],
  });

  const primary = members.find((m) => m.role === "primary");
  const neighbour = members.find((m) => m.role === "neighbour");
  const calls: Promise<unknown>[] = [];
  if (primary) calls.push(briefingCall(elder, alert, primary, { recommended_actions: "Call her right now; if she doesn't answer, ask the neighbour to go over." }));
  if (neighbour && !mental) calls.push(briefingCall(elder, alert, neighbour, { recommended_actions: `Please check on ${elder.preferredName} at home now.` }));
  void Promise.all(calls);

  // Repeat the Telegram alert every 2 min until acknowledged (max 3).
  for (let i = 1; i <= 3; i++) {
    await scheduleJob(`emrep-${alert.alertId}-${i}`, new Date(Date.now() + i * 120_000), { type: "emergency_repeat", alertId: alert.alertId, n: i });
  }

  const alerted = [primary?.name, ...members.filter((m) => m.role === "secondary").map((m) => m.name), mental ? undefined : neighbour?.name].filter(Boolean) as string[];
  return { alert, alerted };
}
