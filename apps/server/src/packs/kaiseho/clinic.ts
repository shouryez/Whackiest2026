import type { Appointment, Elder } from "@kaiseho/shared";
import { env } from "../../env";
import { elevenLabsReady, isPlaceholderPhone, placeOutboundCall } from "../../engine/calls";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { scheduleAt } from "../../engine/scheduler";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";

/**
 * Clinic-calling agent, Ek Call "Act" mode (plan.md P2-14 / Section 9.3).
 * KaiseHo calls the clinic on the elder's behalf, discloses it is an AI, shares only her name
 * and "follow-up visit", books a slot via its own MCP door (/mcp/clinic), then tells the family
 * and tells her in the next check-in call. Without a clinic agent configured: a labelled simulation.
 */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HINDI_DAYS: Record<string, number> = { ravivar: 0, somvar: 1, mangalvar: 2, budhvar: 3, guruvar: 4, shukravar: 5, shanivar: 6 };

export function spokenSlot(iso: string, tz = "Asia/Kolkata"): string {
  const d = new Date(`${iso.slice(0, 16)}:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

/** "Thursday morning" → next Thursday 10:30 (local ISO, no zone). Used by the simulation and as a hint. */
export function suggestSlot(preferred: string, tz = "Asia/Kolkata", today = localDate(tz)): string {
  const p = preferred.toLowerCase();
  let dow = DAYS.findIndex((d) => p.includes(d) || p.includes(d.slice(0, 3)));
  if (dow < 0) for (const [k, v] of Object.entries(HINDI_DAYS)) if (p.includes(k)) dow = v;
  const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
  let ahead = p.includes("tomorrow") || p.includes("kal") ? 1 : dow < 0 ? 2 : (dow - todayDow + 7) % 7 || 7;
  if (ahead === 0) ahead = 7;
  const time = /evening|shaam|sham/.test(p) ? "17:30" : /afternoon|dopahar/.test(p) ? "15:00" : /morning|subah/.test(p) ? "10:30" : "11:00";
  return `${addDays(today, ahead)}T${time}`;
}

export async function requestAppointment(elder: Elder, input: { preferred: string; reason?: string; clinicId?: string; requestedBy: string; simulated?: boolean }): Promise<Appointment> {
  const clinic = elder.clinics?.find((c) => c.clinicId === input.clinicId) ?? elder.clinics?.[0];
  if (!clinic) throw new Error(`No clinic saved for ${elder.preferredName}. Add one on the dashboard first.`);
  const appt: Appointment = {
    elderId: elder.elderId, familyId: elder.familyId, appointmentId: newId("appt"), clinicId: clinic.clinicId, clinicName: clinic.name,
    doctor: clinic.doctor, preferred: input.preferred.slice(0, 80), reason: "follow-up visit", status: "requested",
    notes: input.reason?.slice(0, 120), requestedBy: input.requestedBy, createdAt: nowIso(), updatedAt: nowIso(),
  };
  await getRepo().putAppointment(appt);
  emit("appointment.updated", elder.familyId, { appointment: appt, label: `🏥 Appointment requested with ${clinic.doctor} (${appt.preferred})` }, elder.elderId);
  // Call the clinic right away (a demo; production would respect clinic hours).
  void callClinic(elder, appt, { simulated: input.simulated }).catch((err) => console.error("[clinic]", err));
  return appt;
}

export async function callClinic(elder: Elder, appt: Appointment, opts: { simulated?: boolean } = {}): Promise<Appointment> {
  const repo = getRepo();
  const clinic = elder.clinics?.find((c) => c.clinicId === appt.clinicId);
  const live = Boolean(clinic && elevenLabsReady(env.ELEVENLABS_CLINIC_AGENT_ID) && !isPlaceholderPhone(clinic.phone) && !opts.simulated);
  appt.status = "calling"; appt.mode = live ? "live" : "simulated"; appt.updatedAt = nowIso();
  await repo.putAppointment(appt);
  emit("appointment.updated", elder.familyId, { appointment: appt, label: `📞 KaiseHo is calling ${appt.clinicName} to book ${appt.preferred}${live ? "" : " (simulated)"}` }, elder.elderId);

  if (live) {
    try {
      await placeOutboundCall({
        agentId: env.ELEVENLABS_CLINIC_AGENT_ID!, toNumber: clinic!.phone,
        dynamicVariables: {
          appointment_id: appt.appointmentId, elder_id: elder.elderId, patient_name: elder.name, doctor: appt.doctor,
          clinic_name: appt.clinicName, preferred_time: appt.preferred, reason: "a follow-up visit", today_local: spokenSlot(`${localDate(elder.tz)}T09:00`).split(",")[0],
          suggested_slot: suggestSlot(appt.preferred, elder.tz),
        },
      });
    } catch (err) {
      await reportNoSlot(elder, appt.appointmentId, `the clinic call didn't go through (${(err as Error).message.slice(0, 60)})`, "failed");
    }
  } else {
    // Simulated receptionist: confirms the requested time a few seconds later.
    scheduleAt(`clinic-sim-${appt.appointmentId}`, new Date(Date.now() + 6000), async () => {
      await confirmAppointment(elder, appt.appointmentId, suggestSlot(appt.preferred, elder.tz), "Booked by the clinic front desk (simulated call)");
    });
  }
  return appt;
}

export async function confirmAppointment(elder: Elder, appointmentId: string, slotLocalIso: string, notes?: string): Promise<Appointment> {
  const repo = getRepo();
  const appt = await repo.getAppointment(elder.elderId, appointmentId);
  if (!appt) throw new Error("unknown appointment");
  if (appt.status === "confirmed") return appt; // idempotent
  appt.status = "confirmed"; appt.slotLocalIso = slotLocalIso.slice(0, 16); appt.slotSpoken = spokenSlot(appt.slotLocalIso, elder.tz);
  appt.notes = [appt.notes, notes].filter(Boolean).join(" · ").slice(0, 300) || undefined; appt.updatedAt = nowIso();
  await repo.putAppointment(appt);

  // The elder hears it in her next check-in call; the day-of call reminds her.
  await repo.putMessage({ elderId: elder.elderId, messageId: newId("msg"), direction: "to_elder", fromName: "KaiseHo",
    text: `Your appointment with ${appt.doctor} at ${appt.clinicName} is booked for ${appt.slotSpoken}.`, delivered: false, createdAt: nowIso() });
  await repo.putMemory({ elderId: elder.elderId, memoryId: newId("mem"), type: "event", text: `Appointment with ${appt.doctor} on ${appt.slotSpoken}`,
    importance: 4, private: false, followUpAfter: appt.slotLocalIso.slice(0, 10), followUpDone: false, source: "tool", lastMentionedAt: nowIso(), createdAt: nowIso() });

  await createAlert({ elder, severity: "info", type: "appointment", title: `Appointment booked: ${appt.slotSpoken}`,
    body: `KaiseHo called ${appt.clinicName} and booked ${elder.preferredName}'s ${appt.reason} with ${appt.doctor} for ${appt.slotSpoken}. She'll be told in her next call.`,
    data: { appointmentId: appt.appointmentId }, telegramLines: ["📅 Add it to your calendar, or plan to go with her."] });
  emit("appointment.updated", elder.familyId, { appointment: appt, label: `✅ ${appt.clinicName} confirmed ${appt.slotSpoken}` }, elder.elderId);
  return appt;
}

export async function reportNoSlot(elder: Elder, appointmentId: string, reason: string, status: "no_slot" | "failed" = "no_slot"): Promise<Appointment> {
  const repo = getRepo();
  const appt = await repo.getAppointment(elder.elderId, appointmentId);
  if (!appt) throw new Error("unknown appointment");
  appt.status = status; appt.notes = reason.slice(0, 200); appt.updatedAt = nowIso();
  await repo.putAppointment(appt);
  await createAlert({ elder, severity: "watch", type: "appointment", title: `Couldn't book ${appt.doctor} (${appt.preferred})`,
    body: `${appt.clinicName}: ${reason}. Please pick another time, or call the clinic yourself.`, data: { appointmentId } });
  emit("appointment.updated", elder.familyId, { appointment: appt, label: `⚠️ ${appt.clinicName}: ${reason}` }, elder.elderId);
  return appt;
}
