"use client";
import { ArrowLeft, BellRing, Check, CheckCircle2, FileText, Phone, PhoneCall, PhoneOff, Play, RotateCcw, ShieldAlert, Siren, Sparkles, Timer, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { post, type Integrations, type Overview } from "@/lib/api";
import { toFeed, type FeedItem } from "@/lib/events";
import { clockSec } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

type CallState = "idle" | "ringing" | "live" | "ended" | "no_answer";

const TIER: Record<string, { card: string; tag: string; name: string }> = {
  T0: { card: "bg-night-2 border-night-3 text-[#c5c9e8]", tag: "bg-t0/30 text-[#d0d3dc]", name: "T0 READ" },
  T1: { card: "bg-[#12285e] border-[#22408a] text-[#d6e3ff]", tag: "bg-t1/40 text-white", name: "T1 LOG" },
  T2: { card: "bg-[#40300f] border-[#6b4c12] text-[#ffe2b5]", tag: "bg-t2/50 text-white", name: "T2 OUTWARD" },
  T3: { card: "bg-[#5a0f17] border-[#ff4d5e] text-[#ffd0d5] shadow-[0_0_28px_rgba(255,77,94,0.35)]", tag: "bg-t3 text-white", name: "T3 SAFETY" },
};

function Orb({ state, seconds }: { state: CallState; seconds: number }) {
  const mm = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const look = {
    idle: { bg: "radial-gradient(circle at 35% 30%, #3a4170, #1b2150 60%, #11163a)", glow: "0 0 0 0 transparent", label: "READY", icon: Phone },
    ringing: { bg: "radial-gradient(circle at 35% 30%, #ffd08a, #fd9b36 45%, #8a4a0a 80%)", glow: "0 0 70px rgba(253,155,54,0.6)", label: "RINGING", icon: PhoneCall },
    live: { bg: "radial-gradient(circle at 35% 30%, #ff9a8a, #e0451f 45%, #5a0f17 80%)", glow: "0 0 80px rgba(255,77,94,0.55)", label: `LIVE ${mm}`, icon: PhoneCall },
    ended: { bg: "radial-gradient(circle at 35% 30%, #9fe3bb, #2e9e5b 45%, #0f3d24 80%)", glow: "0 0 60px rgba(46,158,91,0.5)", label: "ENDED", icon: CheckCircle2 },
    no_answer: { bg: "radial-gradient(circle at 35% 30%, #c9c9c9, #6b6f80 50%, #2a2d3e)", glow: "0 0 40px rgba(150,150,170,0.4)", label: "NO ANSWER", icon: PhoneOff },
  }[state];
  const Icon = look.icon;
  return (
    <div className="relative mx-auto grid size-56 place-items-center">
      {(state === "ringing" || state === "live") && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-saffron/15" style={{ animationDuration: "1.8s" }} />
          <span className="absolute -inset-4 rounded-full border border-white/10" />
        </>
      )}
      <div className="relative grid size-48 place-items-center rounded-full transition-all duration-500" style={{ background: look.bg, boxShadow: look.glow }}>
        <div className="text-center">
          <Icon className="mx-auto size-9 text-white/90" />
          <p className="mt-2 font-mono text-xl font-bold tracking-wider text-white">{look.label}</p>
        </div>
      </div>
    </div>
  );
}

function Wave({ on }: { on: boolean }) {
  return (
    <div className="flex h-14 items-center justify-center gap-1.5">
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className={cx("w-1.5 rounded-full bg-saffron", on ? "wave-bar" : "opacity-25")}
          style={{ height: on ? `${30 + ((i * 37) % 70)}%` : "18%", animationDelay: `${(i % 6) * 0.11}s`, animationDuration: `${0.7 + (i % 4) * 0.18}s` }} />
      ))}
    </div>
  );
}

function FeedRow({ it }: { it: FeedItem }) {
  if (it.kind === "speech-agent" || it.kind === "speech-elder") {
    const agent = it.kind === "speech-agent";
    return (
      <div className={cx("animate-slide-in flex", agent ? "justify-start" : "justify-end")}>
        <div className={cx("max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug", agent ? "rounded-bl-md bg-[#232a63] text-[#e3e6ff]" : "rounded-br-md bg-saffron/90 text-ink")}>
          <p className={cx("mb-0.5 text-[10px] font-bold uppercase tracking-widest", agent ? "text-[#8c93c9]" : "text-ink/60")}>{agent ? "KaiseHo (AI)" : "Amma"}</p>
          {it.text.replace(/^“|”$/g, "")}
        </div>
      </div>
    );
  }
  if (it.kind === "tool" || it.kind === "rejected") {
    const t = TIER[it.tier ?? "T0"] ?? TIER.T0;
    return (
      <div className={cx("animate-slide-in flex items-center justify-between gap-3 rounded-xl border px-4 py-3", it.kind === "rejected" ? "border-white/20 bg-white/5 text-white/80" : t.card)}>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{it.kind === "rejected" ? "⛔ " : ""}{it.text}</p>
          <p className="font-mono text-[11px] opacity-60">{clockSec(it.ts)} · {it.detail}</p>
        </div>
        <span className={cx("shrink-0 rounded-md px-2 py-1 font-mono text-[10px] font-extrabold tracking-wider", it.kind === "rejected" ? "bg-white/15" : t.tag)}>{it.kind === "rejected" ? "BLOCKED" : t.name}</span>
      </div>
    );
  }
  const style = {
    "alert-urgent": "border-danger bg-danger text-white animate-danger",
    alert: "border-[#2e9e5b]/40 bg-[#0f2a1c] text-[#bff0d2]",
    summary: "border-[#2e9e5b]/50 bg-[#0f2a1c] text-[#bff0d2]",
    nudge: "border-saffron/50 bg-saffron/10 text-saffron",
    call: "border-white/10 bg-white/5 text-white/80",
    notify: "border-white/10 bg-white/5 text-white/80",
    ack: "border-[#2e9e5b]/40 bg-[#0f2a1c] text-[#bff0d2]",
    system: "border-white/10 bg-transparent text-white/50",
  }[it.kind as string] ?? "border-white/10 text-white/70";
  return (
    <div className={cx("animate-slide-in rounded-xl border px-4 py-2.5", style)}>
      <p className="text-sm font-semibold">{it.text}</p>
      {it.detail && <p className="mt-0.5 line-clamp-2 text-xs opacity-75">{it.detail}</p>}
    </div>
  );
}

export default function LiveOps() {
  const { events, bump } = useLive();
  const { data: ov } = useApi<Overview>("/family/overview");
  const { data: integ } = useApi<Integrations>("/health/integrations");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Current call = everything since the most recent call.ringing / in_progress (or demo reset).
  const { session, state, startedAt } = useMemo(() => {
    let start = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "call.ringing" || events[i].type === "demo.reset") { start = i; break; }
      if (events[i].type === "call.in_progress" && start === 0) start = i;
    }
    const sess = events.slice(start);
    let st: CallState = "idle"; let at: string | undefined;
    for (const ev of sess) {
      if (ev.type === "call.ringing") { st = "ringing"; at = undefined; }
      if (ev.type === "call.in_progress" || (ev.type === "tool.called" && (st === "ringing" || st === "idle"))) { st = "live"; at = at ?? ev.ts; }
      if (ev.type === "call.ended") st = (ev.payload as { status?: string }).status === "no_answer" ? "no_answer" : "ended";
    }
    return { session: sess, state: st, startedAt: at };
  }, [events]);

  const feed = session.map(toFeed).filter(Boolean) as FeedItem[];
  const conversation = feed.filter((f) => !["notify", "ack", "alert-urgent", "alert", "summary", "nudge"].includes(f.kind));
  const fanout = feed.filter((f) => ["alert-urgent", "alert", "notify", "ack"].includes(f.kind));
  const summary = [...session].reverse().find((e) => e.type === "summary.ready");
  const nudge = [...session].reverse().find((e) => e.type === "nudge.created");
  const seconds = startedAt && state === "live" ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const tools = feed.filter((f) => f.kind === "tool").length;
  const elder = ov?.elders[0];

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [conversation.length]);

  const act = async (key: string, path: string, body?: unknown) => { setBusy(key); try { await post(path, body); bump(); } catch (e) { alert((e as Error).message); } finally { setTimeout(() => setBusy(null), 1500); } };

  return (
    <div className="flex min-h-screen flex-col bg-night text-[#e8eaf6]" style={{ backgroundImage: "radial-gradient(circle at 20% 0%, rgba(253,155,54,0.08), transparent 40%), radial-gradient(circle at 90% 100%, rgba(42,91,200,0.12), transparent 45%)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="grid size-9 place-items-center rounded-xl bg-white/5 hover:bg-white/10" aria-label="Back"><ArrowLeft className="size-4" /></Link>
          <div>
            <p className="font-display text-2xl font-semibold">Ek Call · <span className="text-saffron">KaiseHo</span> Live Ops</p>
            <p className="text-xs text-[#8c93c9]">Every MCP tool call, the moment it happens · colour = risk tier</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {state === "live" && <span className="flex items-center gap-1.5 rounded-full bg-danger/20 px-3 py-1.5 text-[#ff8a95] ring-1 ring-danger/50"><span className="size-2 animate-pulse rounded-full bg-[#ff4d5e]" />LIVE CALL</span>}
          <span className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">MCP /mcp/agent ✓</span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">{integ?.elevenlabs ? "ElevenLabs phone ✓" : "Simulated voice"}</span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">Telegram {integ?.telegram ? "✓" : "· dashboard"}</span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">🇮🇳 Data in India</span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 font-mono ring-1 ring-white/10">{new Date(now).toLocaleTimeString("en-IN", { hour12: false })}</span>
        </div>
      </header>

      <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[320px_1fr_360px]">
        {/* call status */}
        <section className="flex flex-col rounded-3xl border border-night-3 bg-night-2/80 p-5">
          <p className="text-[11px] font-bold tracking-[0.2em] text-[#8c93c9]">CALL STATUS</p>
          <div className="mt-4"><Orb state={state} seconds={seconds} /></div>
          <Wave on={state === "live"} />
          <dl className="mt-2 space-y-2 text-sm">
            {[["Elder", elder ? `${elder.elder.name} ${elder.elder.preferredName}, ${elder.elder.age}` : "…"], ["Language", "Kannada · Hindi"], ["Agent", "kaiseho-caller"], ["Tool calls", String(tools)], ["Call reason", "daily check-in"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2"><dt className="text-[#8c93c9]">{k}</dt><dd className="font-semibold text-white">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-auto space-y-2 pt-5">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#8c93c9]">DEMO CONTROLS</p>
            <button disabled={!!busy} onClick={() => act("call", "/elders/eld_lakshmi/call-now")} className="flex w-full items-center gap-2 rounded-xl bg-saffron px-3 py-2.5 text-sm font-bold text-ink hover:bg-[#f08c22] disabled:opacity-50"><PhoneCall className="size-4" />Call Amma now</button>
            <button disabled={!!busy} onClick={() => act("quick", "/elders/eld_lakshmi/call-now", { quick: true })} className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"><Timer className="size-4" />Quick test call (~45 s, saves credits)</button>
            <button disabled={!!busy} onClick={() => act("play", "/demo/play-call", { scam: true })} className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"><Play className="size-4" />Play demo call (free · no voice)</button>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={!!busy} onClick={() => act("em", "/demo/simulate-emergency")} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2 text-[11px] font-semibold hover:bg-white/10"><Siren className="size-4 text-[#ff8a95]" />Emergency</button>
              <button disabled={!!busy} onClick={() => act("na", "/demo/simulate-no-answer")} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2 text-[11px] font-semibold hover:bg-white/10"><PhoneOff className="size-4" />No answer</button>
              <button disabled={!!busy} onClick={() => act("reset", "/demo/seed")} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2 text-[11px] font-semibold hover:bg-white/10"><RotateCcw className="size-4" />Reset</button>
            </div>
          </div>
        </section>

        {/* conversation + tool timeline */}
        <section className="flex min-h-[60vh] flex-col rounded-3xl border border-night-3 bg-night-2/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#8c93c9]">CONVERSATION & TOOL CALLS · REAL TIME</p>
            <div className="flex gap-1.5 font-mono text-[10px] font-bold">
              {Object.entries(TIER).map(([k, v]) => <span key={k} className={cx("rounded px-1.5 py-0.5", v.tag)}>{v.name}</span>)}
            </div>
          </div>
          <div ref={scroller} className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {conversation.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-[#8c93c9]">
                <div>
                  <Phone className="mx-auto size-10 opacity-40" />
                  <p className="mt-3 font-semibold text-white/80">Waiting for a call</p>
                  <p className="mt-1 text-sm">Press <b>Call Amma now</b> (real phone) or <b>Play demo call</b>. Every tool call appears here, colour-coded by risk tier.</p>
                </div>
              </div>
            ) : conversation.map((it) => <FeedRow key={it.id} it={it} />)}
          </div>
        </section>

        {/* fan-out */}
        <section className="flex flex-col gap-4">
          <div className="rounded-3xl border border-night-3 bg-night-2/80 p-5">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[#8c93c9]"><BellRing className="size-3.5" />ALERT FAN-OUT</p>
            {fanout.length === 0 ? <p className="text-sm text-[#8c93c9]">No alerts this call. Scam or emergency alerts reach the family here within seconds.</p> : (
              <div className="space-y-2">
                {fanout.slice(-8).map((it) => (
                  <div key={it.id} className={cx("animate-slide-in flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm",
                    it.kind === "alert-urgent" ? "animate-danger bg-danger text-white" : it.kind === "ack" ? "bg-[#0f2a1c] text-[#bff0d2]" : "bg-white/5")}>
                    {it.kind === "alert-urgent" ? <ShieldAlert className="mt-0.5 size-4 shrink-0" /> : it.kind === "ack" ? <Check className="mt-0.5 size-4 shrink-0" /> : it.ok ? <Check className="mt-0.5 size-4 shrink-0 text-[#6ee7a0]" /> : <X className="mt-0.5 size-4 shrink-0 text-white/40" />}
                    <div className="min-w-0"><p className="font-semibold">{it.text}</p>{it.detail && <p className="line-clamp-2 text-xs opacity-75">{it.detail}</p>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {summary && (
            <div className="animate-slide-in rounded-3xl border border-[#2e9e5b]/40 bg-[#0f2a1c] p-5">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[#6ee7a0]"><FileText className="size-3.5" />SUMMARY FOR RAVI</p>
              <p className="text-sm leading-relaxed text-[#e2f7ea]">{(summary.payload as { summary?: { family_en?: string } }).summary?.family_en}</p>
              <p className="mt-2 text-xs text-[#9fd8b6]">{(summary.payload as { summary?: { family_native?: string } }).summary?.family_native}</p>
            </div>
          )}
          {nudge && (
            <div className="animate-slide-in rounded-3xl border border-saffron/40 bg-saffron/10 p-5">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-saffron"><Sparkles className="size-3.5" />NUDGE SENT TO RAVI</p>
              <p className="font-display text-lg font-semibold text-white">{(nudge.payload as { nudge?: { text?: string } }).nudge?.text}</p>
              <p className="mt-1 text-xs text-saffron/80">Ask: “{(nudge.payload as { nudge?: { starters?: { starter: string }[] } }).nudge?.starters?.[0]?.starter}”</p>
            </div>
          )}
        </section>
      </div>

      <footer className="overflow-hidden border-t border-white/5 py-2.5 text-xs font-semibold tracking-wide text-[#8c93c9]">
        <div className="animate-ticker flex w-max gap-12 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k} className="flex gap-12">
              <span>🔒 Approval lives in our server, not in the model</span><span>💸 No money tools exist</span><span>🧾 Every action audited</span>
              <span>🎙️ No audio stored · transcripts deleted in 24 h</span><span>🇮🇳 Data stays in India</span><span>🤝 Amma consented and can stop it with one sentence</span>
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
