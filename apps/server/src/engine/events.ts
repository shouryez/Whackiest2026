import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@kaiseho/shared";

/**
 * In-process event bus (plan.md Section 12.6). Live Ops and the dashboard read it via
 * SSE (/api/live/stream) or polling (/api/live/events?since=). Ring buffer of recent events.
 */
const MAX = 1000;
const buffer: LiveEvent[] = [];
let seq = 0;
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emit(type: LiveEventType, familyId: string, payload: Record<string, unknown>, elderId?: string): LiveEvent {
  const ev: LiveEvent = { id: ++seq, ts: new Date().toISOString(), familyId, elderId, type, payload };
  buffer.push(ev);
  if (buffer.length > MAX) buffer.shift();
  bus.emit("event", ev);
  return ev;
}

export function eventsSince(since: number, familyId?: string): LiveEvent[] {
  return buffer.filter((e) => e.id > since && (!familyId || e.familyId === familyId));
}

export function lastEventId(): number {
  return seq;
}

export function clearEvents(): void {
  buffer.length = 0;
}
