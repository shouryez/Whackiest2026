export const MOOD_EMOJI = ["", "😞", "😕", "😐", "🙂", "😄"];
export const MOOD_WORD = ["", "Very low", "Low", "Okay", "Good", "Very good"];

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
export const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");
export const clockSec = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "");
export const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
export const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" });
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
export const slotLabel: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };
