import type { CheckIn, Elder, Medication, Vital } from "@kaiseho/shared";
import { classify, DEFAULT_TARGETS, UNIT } from "./vitals";
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

export async function seedDemo(opts: { resetEvents?: boolean; inLaws?: boolean } = {}): Promise<void> {
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
    languages: ["kn", "hi"], primaryLanguage: process.env.DEMO_ELDER_LANGUAGE === "hi" ? "hi" : process.env.DEMO_ELDER_LANGUAGE === "en" ? "en" : "kn", phone: process.env.DEMO_ELDER_PHONE || "+910000000000",
    city: "Mysuru", lat: 12.2958, lon: 76.6394, address: "(demo address, Mysuru)", tz: "Asia/Kolkata",
    callTimeLocal: "09:00", callDays: [0, 1, 2, 3, 4, 5, 6], conditions: ["hypertension", "type 2 diabetes", "knee arthritis"],
    status: "active", privacy: { shareMedicines: true, shareWellbeing: true, shareMemories: true }, createdAt,
    clinics: [{ clinicId: "clinic_rao", name: "Rao Clinic, Mysuru", doctor: "Dr. Rao", phone: process.env.DEMO_CLINIC_PHONE || "+910000000009" }],
    // Retired school teacher: state pension through her bank; life certificate due every November (P2-9).
    pension: { pensioner: true, kind: "state", disbursedBy: "Canara Bank, Mysuru" },
    // Emergency card + home readings + LPG tracking.
    allergies: ["Sulfa drugs"], bloodGroup: "B+", vitalsTracked: ["sugar", "bp"],
    gas: { lastRefill: addDays(localDate("Asia/Kolkata"), -40), intervalDays: 45 },
    voiceStyle: "warm",
  };
  await repo.putElder(elder);

  const meds: Medication[] = [
    { elderId: elder.elderId, medId: "med_metformin", name: "Metformin", dose: "500 mg", slots: ["morning", "night"], withFood: "after", startDate: "2026-01-01", stockCount: 8, refillThresholdDays: 3, active: true, addedBy: "family:mem_ravi", critical: true },
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
  // The human side of each day (from natural conversation): who she saw, whether she went out, what she ate, one good moment.
  const SOCIAL: CheckIn["social"][] = ["met_people", "phone_only", "met_people", "phone_only", "met_people", "phone_only", "alone", "alone", "alone", "alone", "phone_only", "met_people", "met_people", "phone_only"];
  const ACTIVITY: CheckIn["activity"][] = ["went_out", "active_home", "went_out", "active_home", "went_out", "active_home", "active_home", "rested", "rested", "rested", "active_home", "active_home", "went_out", "active_home"];
  const APPETITE: CheckIn["appetite"][] = ["good", "good", "good", "good", "good", "good", "ok", "low", "low", "ok", "good", "good", "good", "good"];
  const HIGHLIGHT: Record<number, string> = { 0: "Made rava idli for the neighbours", 2: "Temple visit with Kamala aunty", 4: "The jasmine on the balcony flowered", 10: "Ravi called; she laughed a lot", 11: "Watched an old Rajkumar film", 13: "Planning bisi bele bath for Kamala aunty" };
  const SUGAR = [124, 118, 112, 131, 126, 120, 138, 141, 136, 172, 129, 122, 118, 116];
  const BP: Record<number, [number, number]> = { 1: [132, 84], 4: [128, 82], 7: [138, 88], 9: [148, 92], 11: [134, 84], 13: [130, 82] };
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
    const low = moods[idx] <= 2;
    await repo.putCall({ elderId: elder.elderId, callId, reason: "daily", status: "completed", attempt: 1, startedAt: `${date}T03:30:00Z`, endedAt: `${date}T03:32:40Z`, durationSec: 160, familyMessagesSent: 0, mode: "live", summary, qualityChecks: { disclosed_ai: true, no_medical_advice: true, no_sensitive_numbers: true, asked_all_meds: true },
      voice: { wpm: low ? 94 + (idx % 3) : 104 + ((idx * 7) % 9), replyGapSec: low ? 1.8 : Math.round((1.1 + (idx % 4) * 0.1) * 10) / 10, turns: 9 } });
    await repo.putCheckIn({ elderId: elder.elderId, callId, date, mood: moods[idx], sleep: low ? "poor" : "good", pain: { where: "knee", level: pains[idx] },
      appetite: APPETITE[idx], social: SOCIAL[idx], activity: ACTIVITY[idx], highlight: HIGHLIGHT[idx], updatedAt: `${date}T03:33:00Z` });
    const vit = (kind: Vital["kind"], value: number, value2?: number): Vital => ({ elderId: elder.elderId, vitalId: `vit_${kind}_${date}`, kind, value, value2, unit: UNIT[kind], context: kind === "sugar" ? "fasting" : "morning", date, measuredAt: `${date}T03:31:00Z`, status: classify(kind, value, value2, kind === "sugar" ? "fasting" : "morning", DEFAULT_TARGETS), source: "voice", callId });
    await repo.putVital(vit("sugar", SUGAR[idx]));
    if (BP[idx]) await repo.putVital(vit("bp", BP[idx][0], BP[idx][1]));
    for (const slot of ["morning", "night"] as const) {
      const missed = (idx === 8 && slot === "night") || (idx === 3 && slot === "night");
      await repo.putMedLog({ elderId: elder.elderId, sk: `${date}#med_metformin#${slot}`, date, medId: "med_metformin", medName: "Metformin 500 mg", slot, status: missed ? "missed" : "taken", callId, loggedAt: `${date}T03:32:00Z` });
    }
  }

  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_knee", type: "health", text: "Knee pain after climbing the temple stairs", importance: 4, private: false, followUpAfter: today, followUpDone: false, source: "tool", lastMentionedAt: `${addDays(today, -3)}T03:31:00Z`, createdAt: `${addDays(today, -3)}T03:31:00Z` });
  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_kamala_surgery", type: "event", text: "Kamala aunty's cataract surgery on Friday", importance: 3, private: false, followUpAfter: today, followUpDone: false, source: "postcall", lastMentionedAt: `${addDays(today, -2)}T03:31:00Z`, createdAt: `${addDays(today, -2)}T03:31:00Z` });
  // Personal hooks the agent brings up warmly (her world, not a form).
  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_jasmine", type: "preference", text: "Loves the jasmine plant on her balcony", importance: 3, private: false, source: "postcall", lastMentionedAt: `${addDays(today, -10)}T03:31:00Z`, createdAt: `${addDays(today, -10)}T03:31:00Z` });
  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_rajkumar", type: "preference", text: "Enjoys old Rajkumar films on TV in the evening", importance: 2, private: false, source: "postcall", lastMentionedAt: `${addDays(today, -3)}T03:31:00Z`, createdAt: `${addDays(today, -3)}T03:31:00Z` });

  // Household needs: one open from a call, one a sibling already claimed.
  await repo.putNeed({ elderId: elder.elderId, familyId: DEMO.familyId, needId: "need_atta", item: "Atta and toor dal", category: "groceries", urgency: "normal", status: "open", createdAt: `${addDays(today, -1)}T03:32:00Z`, updatedAt: `${addDays(today, -1)}T03:32:00Z`, source: "voice" });
  await repo.putNeed({ elderId: elder.elderId, familyId: DEMO.familyId, needId: "need_metformin", item: "Metformin strip", category: "medicine", urgency: "soon", status: "claimed", claimedBy: "Priya", createdAt: `${addDays(today, -1)}T03:32:00Z`, updatedAt: `${addDays(today, -1)}T08:10:00Z`, source: "voice" });

  await repo.putMemory({ elderId: elder.elderId, memoryId: "mem_private_savings", type: "preference", text: "(private) something about her savings", importance: 2, private: true, source: "tool", lastMentionedAt: createdAt, createdAt });

  // Family calls: 1 in the 7 days before, 3 in the last 7 days (the demo's "I called her" makes it 4).
  const fcAt = (daysAgo: number, by: string, source: "button" | "elder_mentioned") => ({ familyId: DEMO.familyId, elderId: elder.elderId, id: `fc_seed_${daysAgo}_${by}`, by, source, at: `${addDays(today, -daysAgo)}T14:30:00Z` });
  for (const f of [fcAt(10, "Ravi", "button"), fcAt(4, "Ravi", "elder_mentioned"), fcAt(3, "Priya", "button"), fcAt(1, "Ravi", "button")]) await repo.putFamilyCall(f);

  // Occasions (P2-10): grandson's birthday in 2 days, Amma's own birthday later this month.
  const mmdd = (d: string) => d.slice(5);
  await repo.putOccasion({ familyId: DEMO.familyId, occasionId: "occ_aarav_bday", elderId: elder.elderId, title: "Aarav's birthday", kind: "birthday", date: mmdd(addDays(today, 2)), person: "Aarav", relation: "grandson", createdBy: "family:mem_ravi", createdAt });
  await repo.putOccasion({ familyId: DEMO.familyId, occasionId: "occ_amma_bday", elderId: elder.elderId, title: "Amma's birthday", kind: "birthday", date: mmdd(addDays(today, 19)), isElders: true, createdBy: "family:mem_ravi", createdAt });

  // Her story book (Yaadein): chapters she told in past calls, one question from the family waiting.
  const sty = (id: string, daysAgo: number, title: string, era: string, text: string, people: string[], place: string | undefined, prompt: string, askedBy?: string) =>
    repo.putStory({ elderId: elder.elderId, familyId: DEMO.familyId, storyId: id, title, era, text, people, place, prompt, askedBy, createdAt: `${addDays(today, -daysAgo)}T03:36:00Z` });
  await sty("sty_wedding", 24, "The wedding in Mysuru", "Young years", "We got married in the summer of 1968 in my father's courtyard in Mysuru. It rained the whole morning and everyone said it was a good sign. Your Appa arrived on a borrowed scooter because the car broke down near Chamundi hill, and he was so nervous he forgot the garland in the car. My mother laughed for a week about it. We had bisi bele bath for four hundred people, cooked by my aunts through the night.", ["Appa", "my mother"], "Mysuru", "Tell me about your wedding day.");
  await sty("sty_cooking", 17, "Learning to cook from Ajji", "Childhood", "My grandmother taught me to make holige when I was nine. She never measured anything: a handful of this, a pinch of that. If the dough tore she would say the holige is angry with you, be gentle with it. I burnt the first four. The fifth one she ate in front of everyone and said it was the best she ever had. I still roll it the way she showed me, from the middle outwards.", ["Ajji"], "Mandya", "Who taught you to cook, and what was the first dish you made?");
  await sty("sty_ravi_school", 10, "Ravi's first day of school", "Raising a family", "Ravi refused to let go of the school gate on his first day. He held it with both hands and cried so loudly the headmaster came out. I promised him a Mysore pak if he stayed till lunch. When I came at lunch he was sitting with three friends and didn't want to come home. He still owes me that Mysore pak, tell him that!", ["Ravi"], "Bengaluru", "What do you remember about your children's school days?", "Priya");
  await sty("sty_advice", 4, "What I'd tell my grandchildren", "Wisdom", "Eat on time, call your mother, and never lend money you can't forget about. And keep one plant. When everything else is going wrong, a plant that needs water every morning reminds you that small things can still go right. That is why I keep my jasmine on the balcony.", ["Aarav"], undefined, "What advice would you give your grandchildren?");
  await repo.putStoryAsk({ elderId: elder.elderId, askId: "ask_first_film", question: "Ajji, what was the first film you saw in a cinema hall?", fromName: "Aarav", status: "waiting", createdAt: `${addDays(today, -1)}T12:00:00Z` });

  // Mind gym: playful games every third day for a month, steady around her usual.
  const games: [number, "word_recall" | "category_naming", number, number, string?][] = [
    [28, "word_recall", 3, 3], [25, "category_naming", 9, 15, "fruits"], [22, "word_recall", 2, 3], [19, "category_naming", 8, 15, "vegetables"],
    [16, "word_recall", 3, 3], [13, "category_naming", 10, 15, "festivals"], [10, "word_recall", 3, 3], [7, "category_naming", 9, 15, "animals"],
    [4, "word_recall", 2, 3], [1, "category_naming", 11, 15, "flowers"],
  ];
  for (const [ago, game, score, max, detail] of games) {
    await repo.putGame({ elderId: elder.elderId, gameId: `gam_seed_${ago}`, date: addDays(today, -ago), game, score, max, detail, createdAt: `${addDays(today, -ago)}T03:37:00Z` });
  }

  await repo.putMessage({ elderId: elder.elderId, messageId: "msg_ravi_sunday", direction: "to_elder", fromName: "Ravi", text: "I'll visit on Sunday", delivered: false, createdAt });

  if (opts.inLaws) await seedInLaw(today, createdAt);
  emit("demo.reset", DEMO.familyId, { seeded: true, days: 14, inLaws: Boolean(opts.inLaws) }, elder.elderId);
}

/**
 * P2-12 multi-elder, multi-language: Ravi's mother-in-law on the same family account,
 * in Hindi, in Lucknow, with her own call time and medicines. Optional (demo seed with inLaws=true).
 */
async function seedInLaw(today: string, createdAt: string): Promise<void> {
  const repo = getRepo();
  const e: Elder = {
    elderId: "eld_nirmala", familyId: DEMO.familyId, name: "Nirmala", preferredName: "Mummy ji", gender: "female", age: 72,
    languages: ["hi"], primaryLanguage: "hi", phone: "+910000000004", city: "Lucknow", lat: 26.8467, lon: 80.9462, tz: "Asia/Kolkata",
    callTimeLocal: "07:30", callDays: [0, 1, 2, 3, 4, 5, 6], conditions: ["hypothyroidism"], status: "active",
    privacy: { shareMedicines: true, shareWellbeing: true, shareMemories: false }, createdAt,
  };
  await repo.putElder(e);
  await repo.putMedication({ elderId: e.elderId, medId: "med_thyroxine", name: "Thyroxine", dose: "50 mcg", slots: ["morning"], withFood: "before", startDate: "2026-01-01", stockCount: 40, refillThresholdDays: 5, active: true, addedBy: "family:mem_ravi" });
  const moods = [4, 4, 3, 4, 4];
  for (let i = 5; i >= 1; i--) {
    const date = addDays(today, -i);
    const callId = `call_${date.replace(/-/g, "")}_0730_n`;
    const m = moods[5 - i];
    await repo.putCall({ elderId: e.elderId, callId, reason: "daily", status: "completed", attempt: 1, startedAt: `${date}T02:00:00Z`, endedAt: `${date}T02:02:10Z`, durationSec: 130, familyMessagesSent: 0, mode: "live",
      summary: { family_en: `Mummy ji sounded ${m >= 4 ? "good" : "okay"} (mood ${m}/5). She took Thyroxine before breakfast.`, family_native: `मम्मी जी आज ${m >= 4 ? "अच्छी" : "ठीक"} थीं। थायरॉक्सिन ✓`, highlights: ["Thyroxine taken ✓"], flags: [], mood: m, source: "rules" } });
    await repo.putCheckIn({ elderId: e.elderId, callId, date, mood: m, sleep: "good", updatedAt: `${date}T02:03:00Z` });
    await repo.putMedLog({ elderId: e.elderId, sk: `${date}#med_thyroxine#morning`, date, medId: "med_thyroxine", medName: "Thyroxine 50 mcg", slot: "morning", status: "taken", callId, loggedAt: `${date}T02:01:00Z` });
  }
}
