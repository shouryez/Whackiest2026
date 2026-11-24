"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type LiveEvent } from "./api";

/**
 * One poller for the whole app (1 s, plan.md P0-10). Every page re-fetches when `version`
 * changes, so a tool call during a live phone call updates every open screen.
 */
interface LiveState {
  events: LiveEvent[];
  version: number;
  online: boolean;
  bump: () => void;
  reset: () => void;
}
const Ctx = createContext<LiveState>({ events: [], version: 0, online: false, bump: () => {}, reset: () => {} });

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(false);
  const since = useRef(0);
  const inFlight = useRef(false);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const reset = useCallback(() => { since.current = 0; setEvents([]); setVersion((v) => v + 1); }, []);

  useEffect(() => {
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await api<{ last: number; events: LiveEvent[] }>(`/live/events?since=${since.current}`);
        setOnline(true);
        if (res.last < since.current) { since.current = 0; setEvents([]); setVersion((v) => v + 1); return; }
        if (res.events.length) {
          since.current = res.events[res.events.length - 1].id;
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            return [...prev, ...res.events.filter((e) => !seen.has(e.id))].slice(-300);
          });
          setVersion((v) => v + 1);
        }
      } catch {
        setOnline(false);
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <Ctx.Provider value={{ events, version, online, bump, reset }}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);

/** Fetch `path` and refetch whenever live data changes. */
export function useApi<T>(path: string | null): { data: T | undefined; error: string | null; reload: () => void } {
  const { version } = useLive();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [path, version, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}
