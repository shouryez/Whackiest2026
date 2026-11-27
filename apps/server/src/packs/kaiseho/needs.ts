import type { Elder, Need, NeedCategory } from "@kaiseho/shared";
import { ToolRejected } from "../../control/tiers";
import { redactPII } from "../../control/redact";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";

/**
 * Household needs: "atta is finishing", "the cylinder is low", "my BP tablets are ending".
 * KaiseHo turns them into a shared list; one sibling taps "I'll handle it", and Amma hears
 * "Priya is arranging the gas cylinder" in her next call. The LPG cylinder is tracked so
 * KaiseHo asks before it runs out.
 */
const GAS_DEFAULT_DAYS = 45;

export function guessCategory(item: string): NeedCategory {
  const t = item.toLowerCase();
  if (/gas|cylinder|lpg|सिलेंडर|ಸಿಲಿಂಡರ್/.test(t)) return "gas";
  if (/tablet|medicine|pill|syrup|insulin|strip|दवा|ಮಾತ್ರೆ/.test(t)) return "medicine";
  if (/tap|leak|fan|light|bulb|plumber|electrician|repair|broken|tv|geyser|fridge/.test(t)) return "repair";
  if (/atta|rice|dal|oil|milk|sugar|vegetable|fruit|tea|coffee|salt|ghee|bread|egg|आटा|चावल|ಅಕ್ಕಿ|ಹಾಲು/.test(t)) return "groceries";
  if (/soap|detergent|toothpaste|phenyl|broom|bucket|battery/.test(t)) return "household";
  return "other";
}

export async function addNeeds(elder: Elder, items: { item: string; category?: NeedCategory; urgency?: "normal" | "soon" }[], source: Need["source"]) {
  const repo = getRepo();
  const open = (await repo.listNeeds(elder.elderId)).filter((n) => n.status !== "done");
  const created: Need[] = [];
  for (const raw of items.slice(0, 8)) {
    const item = redactPII(raw.item).trim().slice(0, 60);
    if (item.length < 2) continue;
    if (open.some((n) => n.item.toLowerCase() === item.toLowerCase())) continue; // already on the list
    const n: Need = {
      elderId: elder.elderId, familyId: elder.familyId, needId: newId("need"), item, category: raw.category ?? guessCategory(item),
      urgency: raw.urgency ?? "normal", status: "open", createdAt: nowIso(), updatedAt: nowIso(), source,
    };
    await repo.putNeed(n);
    created.push(n);
  }
  if (!created.length) return { added: [], note: "already on the list" };
  emit("need.updated", elder.familyId, { needs: created, label: `🛒 ${elder.preferredName} needs: ${created.map((n) => n.item).join(", ")}` }, elder.elderId);
  if (source === "voice") {
    await createAlert({
      elder, severity: created.some((n) => n.urgency === "soon") ? "watch" : "info", type: "need",
      title: `${elder.preferredName} needs: ${created.map((n) => n.item).join(", ")}`,
      body: `Mentioned in today's call. Tap "I'll handle it" so everyone knows it's covered, and KaiseHo will tell ${pr(elder).her} who's arranging it.`,
      data: { needIds: created.map((n) => n.needId) },
    });
  }
  return { added: created.map((n) => n.item), note: "family will arrange it" };
}

async function update(elder: Elder, needId: string, status: "claimed" | "done", by: string) {
  const repo = getRepo();
  const n = await repo.getNeed(elder.elderId, needId);
  if (!n) throw Object.assign(new ToolRejected("unknown item"), { status: 404 });
  if (n.status === "done" || n.status === status) return n;
  n.status = status;
  n.claimedBy = n.claimedBy ?? by;
  n.updatedAt = nowIso();
  await repo.putNeed(n);
  if (status === "done" && n.category === "gas") {
    const last = elder.gas?.lastRefill;
    const today = localDate(elder.tz);
    const interval = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86400_000) : undefined;
    elder.gas = { lastRefill: today, intervalDays: interval && interval > 15 && interval < 120 ? Math.round(((elder.gas?.intervalDays ?? interval) + interval) / 2) : elder.gas?.intervalDays ?? GAS_DEFAULT_DAYS };
    await repo.putElder(elder);
  }
  emit("need.updated", elder.familyId, { need: n, label: `${status === "done" ? "✅" : "🙋"} ${by} ${status === "done" ? "got" : "is arranging"}: ${n.item}` }, elder.elderId);
  return n;
}
export const claimNeed = (elder: Elder, needId: string, by: string) => update(elder, needId, "claimed", by);
export const completeNeed = (elder: Elder, needId: string, by: string) => update(elder, needId, "done", by);

export async function claimAllOpen(elder: Elder, by: string): Promise<number> {
  const open = (await getRepo().listNeeds(elder.elderId)).filter((n) => n.status === "open");
  for (const n of open) await claimNeed(elder, n.needId, by);
  return open.length;
}

export function gasStatus(elder: Elder, today = localDate(elder.tz)) {
  if (!elder.gas?.lastRefill) return null;
  const interval = elder.gas.intervalDays ?? GAS_DEFAULT_DAYS;
  const since = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${elder.gas.lastRefill}T00:00:00Z`)) / 86400_000);
  return { lastRefill: elder.gas.lastRefill, intervalDays: interval, daysSince: since, daysLeft: interval - since, expectedBy: addDays(elder.gas.lastRefill, interval) };
}

/** Dynamic variable: what to tell her about her list, and whether to ask about the gas. */
export async function needsNote(elder: Elder, today = localDate(elder.tz)): Promise<string> {
  const needs = await getRepo().listNeeds(elder.elderId);
  const parts: string[] = [];
  const news = needs.filter((n) => n.status !== "open" && n.elderToldStatus !== n.status);
  const done = news.filter((n) => n.status === "done"), claimed = news.filter((n) => n.status === "claimed");
  if (claimed.length) parts.push(`Tell her: ${claimed.map((n) => `${n.claimedBy?.replace(/^family:\w+$/, "the family") ?? "the family"} is arranging the ${n.item}`).join("; ")}.`);
  if (done.length) parts.push(`Tell her: ${done.map((n) => `the ${n.item} has been taken care of`).join("; ")}.`);
  const open = needs.filter((n) => n.status === "open");
  if (open.length) parts.push(`Still on her list (family notified): ${open.map((n) => n.item).join(", ")}.`);
  const gas = gasStatus(elder, today);
  if (gas && gas.daysLeft <= 7 && !needs.some((n) => n.category === "gas" && n.status !== "done")) {
    parts.push(`Her gas cylinder was refilled ${gas.daysSince} days ago and usually lasts about ${gas.intervalDays}. Ask casually if it's running low; if yes, call add_need.`);
  }
  return parts.join(" ") || "none";
}

/** After a completed call: whatever news was in her context has now been told. */
export async function markNeedsTold(elder: Elder, before: string): Promise<void> {
  const repo = getRepo();
  for (const n of await repo.listNeeds(elder.elderId)) {
    if (n.status !== "open" && n.elderToldStatus !== n.status && n.updatedAt <= before) await repo.putNeed({ ...n, elderToldStatus: n.status });
  }
}
