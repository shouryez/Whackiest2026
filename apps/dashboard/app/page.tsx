"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, API, type Alert, type LiveEvent, type Overview, type TodayView } from "./api";

const MOOD_EMOJI = ["", "😞", "😕", "😐", "🙂", "😄"];
const TIER_STYLE: Record<string, string> = {
  T0: "bg-white border-t0/40 text-ink",
  T1: "bg-[#eef3ff] border-t1/50 text-navy",
  T2: "bg-saffron-soft border-t2/50 text-[#7a3d06]",
  T3: "bg-[#fdecec] border-t3 text-t3 animate-pulse-red",
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** One live event → a human line for the feed. */
function describe(ev: LiveEvent): { text: string; tier?: string; tone: string } {
  const p = ev.payload as Record<string, any>;
  switch (ev.type) {
    case "tool.called":
      return { text: p.label, tier: p.tier, tone: TIER_STYLE[p.tier] ?? TIER_STYLE.T0 };
    case "tool.rejected":
      return { text: `⛔ Blocked by control layer: ${p.tool} (${p.reason})`, tier: p.tier, tone: "bg-white border-ink/30 text-ink" };
    case "alert.created":
      return { text: `${p.alert.severity === "urgent" || p.alert.severity === "emergency" ? "🚨" : "🔔"} Alert: ${p.alert.title}`, tone: p.alert.severity === "urgent" || p.alert.severity === "emergency" ? "bg-t3 text-white border-t3" : "bg-white border-forest/40 text-forest" };
    case "alert.notified":
      return { text: `📱 ${p.channel} → ${p.to}: ${p.status === "delivered" ? "delivered ✓" : p.status === "not_linked" ? "not linked (dashboard only)" : "failed"}`, tone: p.status === "delivered" ? "bg-forest-soft border-forest/40 text-forest" : "bg-white border-ink/20 text-ink/60" };
    case "alert.acked":
      return { text: `✅ Alert acknowledged by ${String(p.by).replace("family:mem_", "")}`, tone: "bg-forest-soft border-forest/40 text-forest" };
    case "demo.reset":
      return { text: "🔄 Demo family seeded (14 days of labelled demo history)", tone: "bg-white border-ink/20 text-ink/60" };
    default:
      return { text: ev.type, tone: "bg-white border-ink/20 text-ink/60" };
  }
}

function TodayCard({ v }: { v: TodayView }) {
  const max = 5;
  return (
    <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-ink/50">TODAY · {v.date}</p>
          <h2 className="mt-1 text-2xl font-extrabold text-forest">
            {v.elder.name} {v.elder.preferredName}
            <span className="ml-2 text-base font-normal text-ink/50">{v.elder.age} · {v.elder.city}</span>
          </h2>
          <p className="text-sm text-ink/60">Daily call {v.elder.callTimeLocal} · {v.elder.languages.join(" / ").toUpperCase()} · {v.elder.status}</p>
        </div>
        <div className="text-5xl" title="mood">{v.wellbeing?.mood ? MOOD_EMOJI[v.wellbeing.mood] : "📞"}</div>
      </div>

      <div className="mt-4 divide-y divide-dashed divide-sand">
        {v.meds.map((m) => (
          <div key={`${m.medId}-${m.slot}`} className="flex justify-between py-2 text-[15px]">
            <span>💊 {m.name} · {m.slot}</span>
            <span className={m.status === "taken" ? "font-bold text-forest" : m.status === "missed" ? "font-bold text-t3" : m.status === "unsure" ? "font-bold text-t2" : "text-ink/40"}>
              {m.status === "taken" ? "✓ taken" : m.status === "missed" ? "✗ missed" : m.status === "unsure" ? "? unsure" : "not asked yet"}
            </span>
          </div>
        ))}
        <div className="flex justify-between py-2 text-[15px]"><span>🙂 Mood</span><span className="font-semibold">{v.wellbeing?.mood ? `${v.wellbeing.mood} / 5` : "—"}</span></div>
        <div className="flex justify-between py-2 text-[15px]"><span>😴 Sleep</span><span className="font-semibold">{v.wellbeing?.sleep ?? "—"}</span></div>
        <div className="flex justify-between py-2 text-[15px]"><span>🦵 Pain</span><span className="font-semibold">{v.wellbeing?.pain ? `${v.wellbeing.pain.where} ${v.wellbeing.pain.level}/10` : "—"}</span></div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold tracking-widest text-ink/50">MOOD · LAST 14 DAYS <span className="font-normal">(demo history)</span></p>
        <div className="mt-2 flex h-20 items-end gap-1.5">
          {v.trend.map((t) => (
            <div key={t.date} title={`${t.date}: mood ${t.mood ?? "—"}`} className={`flex-1 rounded-t ${t.mood !== null && t.mood <= 2 ? "bg-saffron" : "bg-[#9cc5a9]"}`} style={{ height: `${((t.mood ?? 0) / max) * 100}%` }} />
          ))}
        </div>
        <p className="mt-2 text-sm text-ink/60">Medicine adherence (14 days): <b className="text-forest">{v.adherence14d ?? "—"}%</b></p>
      </div>

      {v.followUps.length > 0 && (
        <div className="mt-4 rounded-xl bg-saffron-soft p-3 text-sm">
          <p className="font-semibold text-rust">KaiseHo will follow up on</p>
          <ul className="mt-1 list-disc pl-5">{v.followUps.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink/50">🔒 {v.privateCount} private item{v.privateCount === 1 ? "" : "s"}: {v.elder.preferredName} asked to keep {v.privateCount === 1 ? "it" : "them"} private · 🎙️ no audio stored · data stays in India</p>
    </section>
  );
}

function AlertsCard({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string) => void }) {
  const open = alerts.filter((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency"));
  const recent = alerts.slice(0, 6);
  return (
    <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-widest text-ink/50">ALERTS {open.length > 0 && <span className="ml-1 rounded-full bg-t3 px-2 py-0.5 text-white">{open.length} open</span>}</p>
      {recent.length === 0 && <p className="mt-3 text-sm text-ink/50">No alerts yet. All quiet.</p>}
      <div className="mt-3 space-y-2">
        {recent.map((a) => (
          <div key={a.alertId} className={`rounded-xl border p-3 text-sm ${a.severity === "urgent" || a.severity === "emergency" ? "border-t3/50 bg-[#fdecec]" : "border-sand bg-cream"}`}>
            <div className="flex items-center justify-between gap-2">
              <b className={a.severity === "urgent" || a.severity === "emergency" ? "text-t3" : "text-forest"}>{a.severity === "urgent" ? "🚨 " : a.type === "message" ? "💬 " : "🔔 "}{a.title}</b>
              {a.status === "open" && (a.severity === "urgent" || a.severity === "emergency") ? (
                <button onClick={() => onAck(a.alertId)} className="rounded-lg bg-forest px-3 py-1 text-xs font-semibold text-white hover:opacity-90">✓ Acknowledge</button>
              ) : (
                <span className="text-xs text-ink/50">{a.status === "acked" ? "acknowledged" : timeOf(a.createdAt)}</span>
              )}
            </div>
            <p className="mt-1 text-ink/80">{a.body}</p>
            {a.type === "scam" && <p className="mt-1 text-xs text-ink/60">Pattern: {String((a.data as any).pattern ?? "").replace("_", " ")} · Cyber helpline 1930</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [health, setHealth] = useState<{ telegram: boolean; elevenlabs: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const since = useRef(0);
  const dirty = useRef(true);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/api/family/overview"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/health`).then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    let alive = true;
    let inFlight = false;
    // Poll live events every second (plan.md Phase 0); refresh the overview when something happened.
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await api<{ last: number; events: LiveEvent[] }>(`/api/live/events?since=${since.current}`);
        if (res.last < since.current) {
          // Server restarted or demo reset: start over.
          since.current = 0;
          setEvents([]);
          dirty.current = true;
          return;
        }
        if (res.events.length) {
          since.current = res.events[res.events.length - 1].id;
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const fresh = res.events.filter((e) => !seen.has(e.id)).reverse();
            return [...fresh, ...prev].slice(0, 80);
          });
          dirty.current = true;
        }
        if (dirty.current) {
          dirty.current = false;
          await loadOverview();
        }
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = setInterval(() => alive && void tick(), 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [loadOverview]);

  const ack = async (id: string) => {
    await api(`/api/alerts/${id}/ack`, { method: "POST" });
    dirty.current = true;
  };
  const demo = async (path: string) => {
    await api(`/api/demo/${path}`, { method: "POST" });
    since.current = 0;
    setEvents([]);
    dirty.current = true;
  };

  const elder = overview?.elders[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-forest">Kaise<span className="text-saffron">Ho</span> <span className="text-base font-normal text-ink/50">· family dashboard</span></h1>
          <p className="text-sm text-ink/60">{overview?.family.name ?? "…"} · powered by Ek Call</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 ${error ? "bg-[#fdecec] text-t3" : "bg-forest-soft text-forest"}`}>{error ? `● server: ${error}` : "● live"}</span>
          <span className="rounded-full bg-white px-3 py-1 text-ink/70 ring-1 ring-sand">Telegram {health?.telegram ? "✓" : "off"}</span>
          <span className="rounded-full bg-white px-3 py-1 text-ink/70 ring-1 ring-sand">ElevenLabs {health?.elevenlabs ? "✓" : "browser test"}</span>
          <button onClick={() => demo("seed")} className="rounded-full bg-white px-3 py-1 text-ink/70 ring-1 ring-sand hover:bg-sand">↺ Reset demo</button>
          <button onClick={() => demo("simulate-scam-alert")} className="rounded-full bg-white px-3 py-1 text-ink/70 ring-1 ring-sand hover:bg-sand">Fallback: inject scam alert</button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          {elder ? <TodayCard v={elder} /> : <div className="rounded-2xl bg-white p-6 text-ink/50">Loading…</div>}
          <AlertsCard alerts={overview?.alerts ?? []} onAck={ack} />
        </div>

        <section className="rounded-2xl bg-[#0b0e24] p-5 text-[#e8eaf6] shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.2em] text-[#8c93c9]">LIVE · TOOL CALLS & ALERTS</p>
            <div className="flex gap-2 text-[10px] font-bold">
              <span className="rounded bg-t0 px-1.5 py-0.5">T0 read</span>
              <span className="rounded bg-t1 px-1.5 py-0.5">T1 log</span>
              <span className="rounded bg-t2 px-1.5 py-0.5">T2 outward</span>
              <span className="rounded bg-t3 px-1.5 py-0.5">T3 safety</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {events.length === 0 && <p className="py-10 text-center text-sm text-[#8c93c9]">Waiting for a call… start a browser test call in ElevenLabs, or run <code className="rounded bg-white/10 px-1">pnpm simulate</code>.</p>}
            {events.map((ev) => {
              const d = describe(ev);
              return (
                <div key={ev.id} className={`animate-slide-in flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[15px] ${d.tone}`}>
                  <span><span className="mr-2 font-mono text-xs opacity-60">{timeOf(ev.ts)}</span>{d.text}</span>
                  {d.tier && <span className="shrink-0 rounded-md bg-black/10 px-2 py-0.5 text-[11px] font-extrabold">{d.tier}</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-center text-xs text-[#8c93c9]">Approval lives in our server, not in the model · No money tools exist · Every action audited · No audio stored</p>
        </section>
      </div>
    </main>
  );
}
