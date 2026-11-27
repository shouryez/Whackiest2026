import type { Elder } from "@kaiseho/shared";
import { localDate } from "../../engine/ids";
import { getRepo } from "../../repo";

/** "family:mem_priya" → "Priya" (falls back to the raw actor). */
export async function memberName(familyId: string, actor: string): Promise<string> {
  const id = actor.replace(/^family:/, "");
  return (await getRepo().listMembers(familyId)).find((m) => m.memberId === id)?.name ?? actor;
}

/**
 * Sibling call rota: the quiet fight in many families ("I always call, you never do").
 * Who called Amma this week and when, and whose turn it is: the person she hasn't heard from longest.
 * Nudges go to that person, not always to the eldest.
 */
export async function callRota(elder: Elder) {
  const repo = getRepo();
  const members = (await repo.listMembers(elder.familyId)).filter((m) => m.role === "primary" || m.role === "secondary");
  const calls = await repo.listFamilyCalls(elder.elderId);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400_000).toISOString();
  const rows = members.map((m) => {
    const mine = calls.filter((c) => c.by === m.name).sort((a, b) => b.at.localeCompare(a.at));
    const last = mine[0]?.at;
    return {
      memberId: m.memberId, name: m.name, relation: m.relation,
      thisWeek: mine.filter((c) => c.at >= weekAgo).length,
      lastCallAt: last ?? null,
      daysSince: last ? Math.floor((now - Date.parse(last)) / 86400_000) : null,
      lastCallDay: last ? localDate(elder.tz, new Date(last)) : null,
    };
  });
  const sorted = [...rows].sort((a, b) => (a.lastCallAt ?? "").localeCompare(b.lastCallAt ?? ""));
  const nextUp = sorted[0] ?? null;
  const anyLast = calls.map((c) => c.at).sort().at(-1);
  const total = rows.reduce((a, r) => a + r.thisWeek, 0);
  return {
    members: rows,
    nextUp: nextUp ? { name: nextUp.name, memberId: nextUp.memberId, daysSince: nextUp.daysSince } : null,
    daysSinceAnyCall: anyLast ? Math.floor((now - Date.parse(anyLast)) / 86400_000) : null,
    thisWeekTotal: total,
    fairness: rows.length > 1 && total > 0 ? Math.round((Math.min(...rows.map((r) => r.thisWeek)) / Math.max(...rows.map((r) => r.thisWeek), 1)) * 100) : null,
  };
}
