import { randomBytes } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomBytes(5).toString("hex")}`;
export const nowIso = () => new Date().toISOString();

/** Local calendar date (YYYY-MM-DD) in a timezone, default IST. */
export function localDate(tz = "Asia/Kolkata", d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
