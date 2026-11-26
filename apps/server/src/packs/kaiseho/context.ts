import type { Elder, Slot } from "@kaiseho/shared";
import { localDate } from "../../engine/ids";
import { weatherNote } from "../../engine/weather";
import { getRepo } from "../../repo";
import { nextDrill } from "./health";
import { occasionsNote } from "./occasions";
import { pensionNote } from "./pension";

/**
 * Context builder (plan.md Section 12.3): everything the agent needs, pushed as
 * ElevenLabs dynamic variables at call start, so the first 30 s need zero tool calls.
 * All values are strings (lists JSON-encoded). Private memories contribute topics only.
 */
const LANG_NAME = { kn: "Kannada", hi: "Hindi", en: "English" } as const;
const SLOT_WORDS: Record<Slot, string> = { morning: "after breakfast", afternoon: "after lunch", evening: "in the evening", night: "after dinner" };

export type DynamicVariables = Record<string, string>;

export async function buildContext(
  elder: Elder,
  reason: string,
  callId: string,
  extras: { reminder_text?: string } = {},
): Promise<DynamicVariables> {
  const repo = getRepo();
  const today = localDate(elder.tz);
  const members = await repo.listMembers(elder.familyId);
  const primary = members.find((m) => m.role === "primary");

  const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active);
  const medsToday = meds.flatMap((m) => m.slots.map((s) => `${m.name} ${m.dose} ${SLOT_WORDS[s]}`));
  const medIds: Record<string, string> = {};
  for (const m of meds) for (const s of m.slots) medIds[`${m.name} ${m.dose}|${s}`] = m.medId;

  const memories = await repo.listMemories(elder.elderId);
  const followUps = memories
    .filter((m) => !m.private && m.followUpAfter && m.followUpAfter <= today && !m.followUpDone)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 2)
    .map((m) => m.text);
  const privateTopics = memories.filter((m) => m.private).map((m) => m.type);

  const messages = (await repo.listMessages(elder.elderId))
    .filter((m) => m.direction === "to_elder" && !m.delivered)
    .slice(0, 2)
    .map((m) => ({ id: m.messageId, from: m.fromName, text: m.text }));

  const lastCompleted = (await repo.listCalls(elder.elderId)).find((c) => c.status === "completed" && c.summary);
  const lastSummary = lastCompleted?.summary?.family_en.split(/(?<=\.)\s/)[0] ?? "";

  // Weekly scam "vaccine" drill on regular check-ins only.
  const drill = reason === "daily" || reason === "checkin" ? await nextDrill(elder) : null;

  const now = new Date();
  const localTime = new Intl.DateTimeFormat("en-IN", { timeZone: elder.tz, hour: "numeric", minute: "2-digit", weekday: "long" }).format(now);

  return {
    elder_id: elder.elderId,
    call_id: callId,
    preferred_name: elder.preferredName,
    elder_name: elder.name,
    language: LANG_NAME[elder.primaryLanguage],
    family_contact_name: primary?.name ?? "your family",
    call_reason: reason,
    local_time: localTime,
    meds_today: medsToday.join("; ") || "none",
    med_ids: JSON.stringify(medIds),
    follow_ups: followUps.join("; ") || "none",
    family_messages: JSON.stringify(messages),
    last_call_summary: lastSummary || "This is one of the first calls.",
    weather_note: await weatherNote(elder.city, elder.lat, elder.lon),
    reminder_text: extras.reminder_text ?? "",
    scam_drill: drill ? `[id:${drill.id}] Ask: "${drill.q}" Safe answer: ${drill.good}` : "none",
    pension_note: reason === "daily" || reason === "checkin" ? pensionNote(elder, primary?.name ?? "the family", today) : "none",
    occasions: reason === "reminder" || reason === "quicktest" ? "none" : await occasionsNote(elder, today),
    privacy_note: privateTopics.length ? `She asked to keep some ${[...new Set(privateTopics)].join("/")} topics private. Never bring them up or share them.` : "none",
  };
}
