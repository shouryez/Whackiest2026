"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ELDER_ID } from "./api";
import { useApi } from "./live";

/** Which parent the app is showing (multi-parent families). ?elder=<id> or the last one picked. */
export interface ElderLite { elderId: string; name: string; preferredName: string; status: string }
interface ElderState { elderId: string; elder?: ElderLite; elders: ElderLite[]; setElderId: (id: string) => void; n: string }
const Ctx = createContext<ElderState>({ elderId: ELDER_ID, elders: [], setElderId: () => {}, n: "Amma" });

export function ElderProvider({ children }: { children: React.ReactNode }) {
  const { data } = useApi<ElderLite[]>("/elders");
  const [elderId, setId] = useState(ELDER_ID);
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search).get("elder");
      const saved = q ?? localStorage.getItem("k-elder");
      if (saved) setId(saved);
      if (q) localStorage.setItem("k-elder", q);
    } catch { /* private mode: default parent */ }
  }, []);
  const elders = data ?? [];
  // If the saved id no longer exists (demo reset), fall back to the first active parent.
  useEffect(() => {
    if (elders.length && !elders.some((e) => e.elderId === elderId)) setId(elders.find((e) => e.status !== "pending_consent")?.elderId ?? elders[0].elderId);
  }, [elders, elderId]);
  const setElderId = useCallback((id: string) => {
    setId(id);
    try { localStorage.setItem("k-elder", id); } catch { /* ignore */ }
  }, []);
  const elder = elders.find((e) => e.elderId === elderId);
  return <Ctx.Provider value={{ elderId, elder, elders, setElderId, n: elder?.preferredName ?? "Amma" }}>{children}</Ctx.Provider>;
}

export const useElder = () => useContext(Ctx);
