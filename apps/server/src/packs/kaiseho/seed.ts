import type { Elder, Medication } from "@kaiseho/shared";
import { addDays, localDate, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { resetRateLimits } from "../../control/tiers";
import { clearEvents, emit } from "../../engine/events";

/**
 * Demo family (plan.md Section 3 persona): Lakshmi Amma, 68, Mysuru, with 14 days of
 * SEEDED history (labelled as demo data on screen). Calls during the demo are live.
 */
export const DEMO = {
  familyId: "fam_lakshmi",
  elderId: "eld_lakshmi",
} as const;

export async function seedDemo(opts: { resetEvents?: boolean } = {}): Promise<void> {
  const repo = getRepo();
  await repo.clearAll();
  resetRateLimits();
  if (opts.resetEvents) clearEvents();

  const createdAt = nowIso();
  await repo.putFamily({ familyId: DEMO.familyId, name: "Lakshmi Amma's family", createdAt, settings: { digestDay: "sun", digestTime: "20:00" } });
  await repo.putMember({ familyId: DEMO.familyId, memberId: "mem_ravi", name: "Ravi", relation: "son", role: "primary", alertLevels: ["info", "watch", "urgent", "emergency"], language: "en", phone: "+910000000001" });
  await repo.putMember({ familyId: DEMO.familyId, memberId: "mem_priya", name: "Priya", relation: "daughter", role: "secondary", alertLevels: ["urgent", "emergency"], language: "en", phone: "+910000000002" });
  await repo.putMember({ familyId: DEMO.familyId, memberId: "mem_kamala", name: "Kamala aunty", relation: "neighbour", role: "neighbour", alertLevels: ["emergency"], language: "kn", phone: "+910000000003" });

  const elder: Elder = {
    elderId: DEMO.elderId, familyId: DEMO.familyId, name: "Lakshmi", preferredName: "Amma", gender: "female", age: 68,
    languages: ["kn", "hi"], primaryLanguage: "kn", phone: process.env.DEMO_ELDER_PHONE || "+910000000000",
    city: "Mysuru", lat: 12.2958, lon: 76.6394, address: "(demo address, Mysuru)", tz: "Asia/Kolkata",
    callTimeLocal: "09:00", callDays: [0, 1, 2, 3, 4, 5, 6], conditions: ["hypertension", "type 2 diabetes", "knee arthritis"],
    status: "active", privacy: { shareMedicines: true, shareWellbeing: true, shareMemories: true }, createdAt,
  };
  await repo.putElder(elder);

  const meds: Medication[] = [
    { elderId: elder.elderId, medId: "med_metformin", name: "Metformin", dose: "500 mg", slots: ["morning", "night"], withFood: "after", startDate: "2026-01-01", stockCount: 8, refillThresholdDays: 3, active: true, addedBy: "family:mem_ravi" },
  ];
  for (const m of meds) await repo.putMedication(m);

  // 14 days of seeded history: mood dips mid-way (3 low days), knee pain easing.
  const NOTES: Record<number, string> = {
    2: "She went to the temple with Kamala aunty.", 6: "She said the house feels quiet.", 7: "She said she misses Ravi.",
    8: "She didn't feel like cooking.", 9: "She was quieter than usual.", 10: "Ravi called her last night; she was happy.",
    11: "Kamala aunty's cataract surgery is on Friday.", 12: "She climbed the temple stairs; knee hurt after.",
  };
  const today = localDate(elder.tz);
  const moods = [4, 4, 5, 4, 4, 4, 3, 2, 2, 2, 3, 4, 4, 4];
  const pains = [6, 6, 6, 5, 5, 5, 5, 5, 4, 4, 4, 3, 3, 3];
  for (let i = 14; i >= 1; i--) {
    const date = addDays(today, -i);
    const idx = 14 - i;
    const callId = `call_${date.replace(/-/g, "")}_0900`;
    const missedNight = idx === 8 || idx === 3;
    const m = moods[idx];
    const summary = {
      family_en: `Amma sounded ${["", "very low", "low", "okay", "good", "very good"][m]} (mood ${m}/5) and slept ${m <= 2 ? "poorly" : "well"}. She took Metformin in the morning${missedNight ? " but missed the night dose" : " and at night"}. Knee pain ${pains[idx]}/10.${NOTES[idx] ? " " + NOTES[idx] : ""}`,
      family_native: `ಅಮ್ಮ ಇಂದು ${m >= 4 ? "ಚೆನ್ನಾಗಿದ್ದರು" : m === 3 ? "ಸಾಧಾರಣವಾಗಿದ್ದರು" : "ಸ್ವಲ್ಪ ಬೇಸರದಲ್ಲಿದ್ದರು"}. ಮೆಟ್‌ಫಾರ್ಮಿನ್ ✓. ಮೊಣಕಾಲು ನೋವು ${pains[idx]}/10.`,
      highlights: [missedNight ? "Missed Metformin (night)" : "All medicines taken ✓", `Knee ${pains[idx]}/10`, ...(NOTES[idx] ? [NOTES[idx]] : [])],
      flags: m <= 2 ? [{ type: "low_mood", severity: "watch" as const, evidence: `mood ${m}/5` }] : [],
      mood: m, source: "rules" as const,
    };
    await repo.putCall({ elderId: elder.elderId, callId, reason: "daily", status: "completed", attempt: 1, startedAt: `${date}T03:30:00Z`, endedAt: `${date}T03:32:40Z`, durationSec: 160, familyMessagesSent: 0, mode: "live", summary, qualityChecks: { disclosed_ai: true, no_medical_advice: true, no_sensitive_numbers: true, asked_all_meds: true } });
    await repo.putCheckIn({ elderId: elder.elderId, callId, date, mood: moods[idx], sleep: moods[idx] <= 2 ? "poor" : "good", pain: { where: "knee", level: pains[idx] }, updatedAt: `${date}T03:33:00Z` });
    for (const slot of ["morning", "night"] as const) {
      const missed = (idx === 8 && slot === "night") || (idx === 3 && slot === "night");
      await repo.putMedLog({ elderId: elder.elderId, sk: `${date}#med_metformin#${slot}`, date, medId: "med_metformin", medName: "Metformin 500 mg", slot, status: missed ? "missed" : "taken", callId, loggedAt: `${date}T03:32:00Z` });
    }
  }

  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_knee", type: "health", text: "Knee pain after climbing the temple stairs", importance: 4, private: false, followUpAfter: today, followUpDone: false, source: "tool", lastMentionedAt: `${addDays(today, -3)}T03:31:00Z`, createdAt: `${addDays(today, -3)}T03:31:00Z` });
  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_kamala_surgery", type: "event", text: "Kamala aunty's cataract surgery on Friday", importance: 3, private: false, followUpAfter: today, followUpDone: false, source: "postcall", lastMentionedAt: `${addDays(today, -2)}T03:31:00Z`, createdAt: `${addDays(today, -2)}T03:31:00Z` });
  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_private_savings", type: "preference", text: "(private) something about her savings", importance: 2, private: true, source: "tool", lastMentionedAt: createdAt, createdAt });

  // Family calls: 1 in the 7 days before, 3 in the last 7 days (the demo's "I called her" makes it 4).
  const fcAt = (daysAgo: number, by: string, source: "button" | "elder_mentioned") => ({ familyId: DEMO.familyId, elderId: elder.elderId, id: `fc_seed_${daysAgo}_${by}`, by, source, at: `${addDays(today, -daysAgo)}T14:30:00Z` });
  for (const f of [fcAt(10, "Ravi", "button"), fcAt(4, "Ravi", "elder_mentioned"), fcAt(3, "Priya", "button"), fcAt(1, "Ravi", "button")]) await repo.putFamilyCall(f);

  await repo.putMessage({ elderId: elder.elderId, messageId: "msg_ravi_sunday", direction: "to_elder", fromName: "Ravi", text: "I'll visit on Sunday", delivered: false, createdAt });

  emit("demo.reset", DEMO.familyId, { seeded: true, days: 14 }, elder.elderId);
}
