/**
 * Scheduler (plan.md Section 16). Phase 4 swaps this for EventBridge Scheduler; locally
 * (DATA_STORE=memory) it is setTimeout/setInterval so the demo never depends on AWS.
 */
const timers = new Map<string, NodeJS.Timeout>();

export function scheduleAt(id: string, when: Date, fn: () => Promise<void> | void): void {
  cancel(id);
  const ms = Math.max(0, when.getTime() - Date.now());
  // setTimeout overflows above ~24.8 days; nothing we schedule is that far out.
  const t = setTimeout(() => {
    timers.delete(id);
    Promise.resolve(fn()).catch((err) => console.error(`[scheduler ${id}]`, err));
  }, Math.min(ms, 2 ** 31 - 1));
  timers.set(id, t);
}

export function cancel(id: string): boolean {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  return timers.delete(id);
}

export function every(id: string, ms: number, fn: () => Promise<void> | void): void {
  cancel(id);
  const t = setInterval(() => {
    Promise.resolve(fn()).catch((err) => console.error(`[scheduler ${id}]`, err));
  }, ms);
  t.unref?.();
  timers.set(id, t);
}

export function pending(): string[] {
  return [...timers.keys()];
}

export function cancelAll(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
