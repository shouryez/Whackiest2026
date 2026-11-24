import type { Elder } from "@kaiseho/shared";
import { addDays, localDate } from "../../engine/ids";
import { getRepo } from "../../repo";

/**
 * Read models for the dashboard. Family-facing outputs respect the elder's sharing
 * choices (filterForFamily, plan.md Section 6.5): private memories never leave the server.
 */
export async function filterForFamily(elder: Elder) {
  const repo = getRepo();
  const memories = await repo.listMemories(elder.elderId);
  return {
    memories: elder.privacy.shareMemories ? memories.filter((m) => !m.private) : [],
    privateCount: memories.filter((m) => m.private).length,
  };
}

export async function todayView(elder: Elder) {
  const repo = getRepo();
  const date = localDate(elder.tz);
  const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active);
  const logs = (await repo.listMedLogs(elder.elderId, date)).filter((l) => l.date === date);
  const checkIns = (await repo.listCheckIns(elder.elderId, date)).filter((c) => c.date === date);
  const latest = checkIns.at(-1);

  const medSlots = meds.flatMap((m) =>
    m.slots.map((slot) => {
      const log = logs.find((l) => l.medId === m.medId && l.slot === slot);
      return { medId: m.medId, name: `${m.name} ${m.dose}`, slot, status: log?.status ?? "pending" };
    }),
  );
  // Ad-hoc meds the elder mentioned that are not in the schedule.
  for (const l of logs.filter((l) => !meds.some((m) => m.medId === l.medId))) {
    medSlots.push({ medId: l.medId, name: l.medName, slot: l.slot, status: l.status });
  }

  // 14-day trend for the sparkline.
  const since = addDays(date, -13);
  const history = await repo.listCheckIns(elder.elderId, since);
  const allLogs = await repo.listMedLogs(elder.elderId, since);
  const adherence = allLogs.length ? Math.round((allLogs.filter((l) => l.status === "taken").length / allLogs.length) * 100) : null;

  const { memories, privateCount } = await filterForFamily(elder);
  const followUps = memories.filter((m) => m.followUpAfter && m.followUpAfter <= date && !m.followUpDone).map((m) => m.text);

  return {
    date,
    elder: {
      elderId: elder.elderId, name: elder.name, preferredName: elder.preferredName, age: elder.age, city: elder.city,
      languages: elder.languages, callTimeLocal: elder.callTimeLocal, status: elder.status, privacy: elder.privacy,
    },
    meds: elder.privacy.shareMedicines ? medSlots : [],
    wellbeing: elder.privacy.shareWellbeing && latest
      ? { mood: latest.mood, sleep: latest.sleep, pain: latest.pain, energy: latest.energy, appetite: latest.appetite }
      : null,
    trend: history.map((c) => ({ date: c.date, mood: c.mood ?? null, pain: c.pain?.level ?? null })),
    adherence14d: adherence,
    followUps,
    privateCount,
  };
}
