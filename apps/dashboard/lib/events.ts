import type { LiveEvent } from "@kaiseho/shared";

export type FeedKind = "speech-agent" | "speech-elder" | "tool" | "rejected" | "alert" | "alert-urgent" | "notify" | "ack" | "call" | "summary" | "system" | "nudge";

export interface FeedItem {
  id: number;
  ts: string;
  kind: FeedKind;
  tier?: string;
  text: string;
  detail?: string;
  ok?: boolean;
}

/** Turn a raw live event into a human line for the feeds (Live Ops, activity). */
export function toFeed(ev: LiveEvent): FeedItem | null {
  const p = ev.payload as Record<string, any>;
  const base = { id: ev.id, ts: ev.ts };
  switch (ev.type) {
    case "tool.called":
      if (p.tool === "speech") return { ...base, kind: p.speech === "agent" ? "speech-agent" : "speech-elder", text: String(p.label).replace(/^\S+\s(KaiseHo|[^:]+):\s/, "") };
      return { ...base, kind: "tool", tier: p.tier, text: p.label, detail: p.ms !== undefined ? `${p.tool} · ${p.ms} ms` : p.tool };
    case "tool.rejected":
      return { ...base, kind: "rejected", tier: p.tier, text: `Blocked by control layer: ${p.tool}`, detail: p.reason };
    case "alert.created": {
      const a = p.alert;
      const urgent = a.severity === "urgent" || a.severity === "emergency";
      return { ...base, kind: urgent ? "alert-urgent" : "alert", text: `${a.severity === "emergency" ? "EMERGENCY · " : urgent ? "URGENT · " : ""}${a.title}`, detail: a.body };
    }
    case "alert.notified":
      return { ...base, kind: "notify", ok: p.status === "delivered", text: `Telegram → ${p.to}`, detail: p.status === "delivered" ? "delivered" : p.status === "not_linked" ? "not linked · dashboard only" : "failed" };
    case "briefing.calling":
      return { ...base, kind: "notify", ok: true, text: `Briefing call → ${p.to} (${p.relation})`, detail: p.mode === "live" ? "ringing" : "simulated" };
    case "alert.acked":
      return { ...base, kind: "ack", text: `Alert acknowledged by ${String(p.by).replace("family:mem_", "").replace(/^\w/, (c: string) => c.toUpperCase())}` };
    case "call.ringing":
      return { ...base, kind: "call", text: `Calling ${p.to ?? "Amma"}${p.attempt > 1 ? ` (attempt ${p.attempt})` : ""}`, detail: `${p.reason} · ${p.mode}` };
    case "call.in_progress":
      return { ...base, kind: "call", text: "Call connected · AI disclosed in the first line", detail: p.mode };
    case "call.ended":
      return { ...base, kind: "call", text: p.status === "completed" ? "Call ended" : p.status === "no_answer" ? "No answer" : `Call ${p.status}`, detail: p.durationSec ? `${Math.round(p.durationSec / 60 * 10) / 10} min` : undefined };
    case "call.scheduled":
      return { ...base, kind: "system", text: `${p.retry ? "Retry" : p.reason === "reminder" ? "Reminder call" : "Callback"} scheduled`, detail: new Date(p.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) };
    case "summary.ready":
      return { ...base, kind: "summary", text: "Summary ready for the family", detail: p.summary?.family_en };
    case "nudge.created":
      return { ...base, kind: "nudge", text: p.nudge?.text ?? "New nudge" };
    case "family_call.logged":
      return { ...base, kind: "ack", text: `${p.by} called Amma ❤️`, detail: `family calls this week: ${p.stats?.thisWeek}` };
    case "message.queued":
      return { ...base, kind: "system", text: `Message from ${p.message?.fromName} queued for the next call`, detail: p.message?.text };
    case "schedule.updated":
      return { ...base, kind: "system", text: `Schedule updated by ${p.by}`, detail: [p.status, p.pausedUntil && `until ${p.pausedUntil}`, p.callTimeLocal && `at ${p.callTimeLocal}`].filter(Boolean).join(" · ") };
    case "demo.reset":
      return { ...base, kind: "system", text: p.deleted ? "All family data deleted" : "Demo family seeded · 14 days of labelled demo history" };
    default:
      return null;
  }
}
