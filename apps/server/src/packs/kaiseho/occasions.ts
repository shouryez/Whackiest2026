import type { Elder, Occasion, OccasionKind } from "@kaiseho/shared";
import { ToolRejected } from "../../control/tiers";
import { redactPII } from "../../control/redact";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";
import FESTIVALS from "./festivals.json";

/**
 * Occasions (plan.md P2-10): grandchildren's birthdays, anniversaries and festivals become a warm
 * greeting in the call, and the elder can send her wish, which KaiseHo relays to the family.
 * Festivals come from the team-maintained festivals.json; family occasions are added on the dashboard or from Claude.
 */
const CITY_STATE: Record<string, string> = {
  mysuru: "karnataka", mysore: "karnataka", bengaluru: "karnataka", bangalore: "karnataka", mangaluru: "karnataka", hubballi: "karnataka",
  hyderabad: "telangana", chennai: "tamil nadu", madurai: "tamil nadu", coimbatore: "tamil nadu", kochi: "kerala", thiruvananthapuram: "kerala",
  mumbai: "maharashtra", pune: "maharashtra", nagpur: "maharashtra", kolkata: "west bengal", lucknow: "uttar pradesh", varanasi: "uttar pradesh",
  delhi: "delhi", "new delhi": "delhi", jaipur: "rajasthan", ahmedabad: "gujarat", bhopal: "madhya pradesh", patna: "bihar", vijayawada: "andhra pradesh",
};

type Festival = { date: string; name: string; regions: string[]; greeting: string; verify?: boolean };
export interface UpcomingOccasion {
  id: string;
  title: string;
  kind: OccasionKind;
  date: string; // next YYYY-MM-DD
  daysAway: number;
  person?: string;
  relation?: string;
  isElders?: boolean;
  wishedThisYear?: boolean;
  source: "family" | "festival";
  greeting?: string;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

/** Next occurrence on/after today; undefined for a one-off date that has passed. */
export function nextDate(date: string, today: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date >= today ? date : undefined;
  if (!/^\d{2}-\d{2}$/.test(date)) return undefined;
  const year = Number(today.slice(0, 4));
  const fix = (y: number) => (date === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? `${y}-02-28` : `${y}-${date}`);
  return fix(year) >= today ? fix(year) : fix(year + 1);
}

export function festivalsFor(elder: Pick<Elder, "city">): Festival[] {
  const state = CITY_STATE[elder.city.toLowerCase().trim()];
  return (FESTIVALS.festivals as Festival[]).filter((f) => f.regions.includes("all") || (state && f.regions.includes(state)));
}

export async function upcomingOccasions(elder: Elder, days = 30, today = localDate(elder.tz)): Promise<UpcomingOccasion[]> {
  const own = (await getRepo().listOccasions(elder.familyId)).filter((o) => !o.elderId || o.elderId === elder.elderId);
  const out: UpcomingOccasion[] = [];
  for (const o of own) {
    const d = nextDate(o.date, today);
    if (!d || daysBetween(today, d) > days) continue;
    out.push({ id: o.occasionId, title: o.title, kind: o.kind, date: d, daysAway: daysBetween(today, d), person: o.person, relation: o.relation, isElders: o.isElders, wishedThisYear: (o.wishedYears ?? []).includes(Number(d.slice(0, 4))), source: "family" });
  }
  for (const f of festivalsFor(elder)) {
    const d = nextDate(f.date, today);
    if (!d || daysBetween(today, d) > days) continue;
    out.push({ id: `fest_${f.name.toLowerCase().replace(/\W+/g, "_")}_${d.slice(0, 4)}`, title: f.name, kind: "festival", date: d, daysAway: daysBetween(today, d), greeting: f.greeting, source: "festival" });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.title.localeCompare(b.title));
}

const dayWord = (n: number, date: string, tz: string) =>
  n === 0 ? "today" : n === 1 ? "tomorrow" : `on ${new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(new Date(`${date}T12:00:00+05:30`))} (in ${n} days)`;

/** Dynamic variable for the caller: what to greet or offer today (max 2 items, "none" if nothing). */
export async function occasionsNote(elder: Elder, today = localDate(elder.tz)): Promise<string> {
  const p = pr(elder);
  const notes: string[] = [];
  for (const o of await upcomingOccasions(elder, 2, today)) {
    if (o.isElders && o.daysAway === 0) notes.push(`Today is ${p.hers} ${o.kind === "anniversary" ? "wedding anniversary" : "birthday"}! Wish ${p.her} warmly at the very start of the call.`);
    else if (o.source === "family" && !o.isElders && !o.wishedThisYear && (o.kind === "birthday" || o.kind === "anniversary"))
      notes.push(`[id:${o.id}] ${o.person ? `${o.person}${o.relation ? ` (${p.hers} ${o.relation})` : ""}'s` : "A family"} ${o.kind} is ${dayWord(o.daysAway, o.date, elder.tz)}. Mention it happily and ask if ${p.she}'d like to send a wish; if yes, call relay_wish with ${p.hers} words.`);
    else if (o.source === "festival" && o.daysAway <= 1) notes.push(`${o.title} is ${o.daysAway === 0 ? "today" : "tomorrow"}: greet ${p.her} with "${o.greeting}" and ask about ${p.hers} plans.`);
    else if (o.source === "family" && !o.isElders && o.kind === "other" && o.daysAway <= 1) notes.push(`${o.title} is ${o.daysAway === 0 ? "today" : "tomorrow"}.`);
    if (notes.length >= 2) break;
  }
  return notes.join(" ") || "none";
}

export async function addOccasion(familyId: string, input: { elderId?: string; title: string; kind: OccasionKind; date: string; person?: string; relation?: string; isElders?: boolean; createdBy: string }): Promise<Occasion> {
  if (!/^(\d{4}-)?\d{2}-\d{2}$/.test(input.date)) throw new ToolRejected("date must be MM-DD (every year) or YYYY-MM-DD (once)");
  const [mm, dd] = input.date.slice(-5).split("-").map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) throw new ToolRejected("not a real date");
  const o: Occasion = {
    familyId, occasionId: newId("occ"), elderId: input.elderId, title: redactPII(input.title).slice(0, 80), kind: input.kind, date: input.date,
    person: input.person?.slice(0, 40), relation: input.relation?.slice(0, 30), isElders: input.isElders || undefined,
    createdBy: input.createdBy, createdAt: nowIso(),
  };
  await getRepo().putOccasion(o);
  emit("schedule.updated", familyId, { occasion: o, by: input.createdBy }, input.elderId);
  return o;
}

/** The elder's wish, relayed to the family (with her consent, given in the call). */
export async function relayWish(elder: Elder, occasionId: string, text: string, callId?: string) {
  const repo = getRepo();
  const o = (await repo.listOccasions(elder.familyId)).find((x) => x.occasionId === occasionId);
  if (!o) throw new ToolRejected("unknown occasion", "send it with send_family_message instead");
  const wish = redactPII(text).slice(0, 300);
  const year = Number((nextDate(o.date, localDate(elder.tz)) ?? localDate(elder.tz)).slice(0, 4));
  o.wishedYears = [...new Set([...(o.wishedYears ?? []), year])];
  await repo.putOccasion(o);
  await repo.putMessage({ elderId: elder.elderId, messageId: newId("msg"), direction: "from_elder", fromName: elder.preferredName, text: `🎂 For ${o.person ?? o.title}: ${wish}`, delivered: true, deliveredAt: nowIso(), createdAt: nowIso() });
  await createAlert({
    elder, severity: "info", type: "occasion", title: `${elder.preferredName}'s wish for ${o.person ? `${o.person}'s ${o.kind}` : o.title}`,
    body: `"${wish}"`, data: { occasionId, callId },
    telegramLines: [`🎂 Please pass it on to ${o.person ?? "them"}. Sent with ${pr(elder).hers} permission during today's call.`],
  });
  return { ok: true, for: o.person ?? o.title };
}

/** After a call: nudge the family about the elder's own birthday/anniversary (today or tomorrow), once a year. */
export async function occasionFamilyNudges(elder: Elder, today = localDate(elder.tz)): Promise<void> {
  const repo = getRepo();
  const p = pr(elder);
  for (const o of (await repo.listOccasions(elder.familyId)).filter((x) => x.isElders && (!x.elderId || x.elderId === elder.elderId))) {
    const d = nextDate(o.date, today);
    if (!d || d > addDays(today, 1)) continue;
    const year = Number(d.slice(0, 4));
    if ((o.familyToldYears ?? []).includes(year)) continue;
    o.familyToldYears = [...(o.familyToldYears ?? []), year];
    await repo.putOccasion(o);
    const what = o.kind === "anniversary" ? "wedding anniversary" : "birthday";
    await createAlert({
      elder, severity: "info", type: "occasion", title: `${d === today ? "Today" : "Tomorrow"} is ${elder.preferredName}'s ${what} 🎂`,
      body: `${d === today ? `KaiseHo wished ${p.her} in today's call` : `KaiseHo will wish ${p.her} in tomorrow's call`}. A call from you would mean the most.`,
      data: { occasionId: o.occasionId }, telegramLines: [`👉 Plan a call or a video call with the grandchildren.`],
    });
  }
}
