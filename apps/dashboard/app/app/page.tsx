"use client";
import { ArrowUpRight, BedDouble, CalendarClock, HeartPulse, MessageSquareText, PhoneCall, PhoneOutgoing, Pill, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Constellation, DAY_WORD, InsightCards, STATUS_WORD, type Wellbeing } from "@/components/Insight";
import { MindGymCard, NeedsBoard } from "@/components/Panels";
import { LatestStoryTile } from "@/components/StoryBook";
import { LiveCallChip, NudgeCard, SummaryBlock } from "@/components/cards";
import { Badge, Button, Card, CardHeader, CountUp, Empty, HandNote, Skeleton, Tile, cx } from "@/components/ui";
import { post, type Overview } from "@/lib/api";
import { useElder } from "@/lib/elder";
import { MOOD_EMOJI, MOOD_WORD, clock, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

/** Minutes until the next daily call (her time = IST for the demo). */
function useNextCall(hhmm?: string) {
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    if (!hhmm) return;
    const tick = () => {
      const [h, m] = hhmm.split(":").map(Number);
      const now = new Date();
      const t = new Date(now); t.setHours(h, m, 0, 0);
      if (t <= now) t.setDate(t.getDate() + 1);
      const mins = Math.round((t.getTime() - now.getTime()) / 60000);
      setLeft(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [hhmm]);
  return left;
}

const SLEEP_WORD: Record<string, string> = { good: "Slept well", ok: "Slept okay", poor: "Slept poorly" };

export default function OverviewPage() {
  const { elderId } = useElder();
  const { data, error } = useApi<Overview>("/family/overview");
  const { bump } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const e = data?.elders.find((x) => x.elder.elderId === elderId) ?? data?.elders[0];
  const id = e?.elder.elderId ?? null;
  const { data: w } = useApi<Wellbeing>(id ? `/elders/${id}/wellbeing` : null);
  const { data: starters } = useApi<{ starters: { starter: string; why: string }[] }>(id ? `/elders/${id}/starters` : null);
  const next = useNextCall(e?.elder.callTimeLocal);

  const act = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    try { await post(path, body); bump(); } finally { setTimeout(() => setBusy(null), 1500); }
  };

  if (error) return <Card><Empty icon={ShieldCheck} title="Can't reach the KaiseHo server">Start it with <code>pnpm dev</code> ({error}).</Empty></Card>;
  if (!data || !e) return <div className="grid gap-5 lg:grid-cols-12"><Skeleton className="h-80 lg:col-span-8" /><Skeleton className="h-80 lg:col-span-4" /><Skeleton className="h-32 lg:col-span-12" /></div>;

  const n = e.elder.preferredName;
  const word = w ? DAY_WORD(w.status, w.today?.index ?? null) : null;
  const highlight = w?.highlights.at(-1);
  const mood = e.wellbeing?.mood;
  const taken = e.meds.filter((m) => m.status === "taken").length;
  const missed = e.meds.filter((m) => m.status === "missed").length;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      {/* ---------- hero ---------- */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="k-glass k-ring animate-fade-up relative overflow-hidden rounded-[28px] border p-6 sm:p-9 lg:col-span-8">
          <div className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-saffron/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 -bottom-32 size-80 rounded-full bg-violet/20 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="k-label text-saffron">{today}</p>
              <LiveCallChip card={e} />
              {e.ring === "green" && !e.liveCall && <Badge tone="forest">● checked in · all fine</Badge>}
              {e.ring === "amber" && <Badge tone="saffron">worth a look</Badge>}
              {e.ring === "red" && <Badge tone="danger">needs attention</Badge>}
              {e.ring === "grey" && <Badge>not called yet today</Badge>}
            </div>
            <h1 className="mt-4 font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-[4rem]">
              {n} is having a <span className="k-grad-text k-glow font-serif font-normal tracking-[-0.02em] italic">{word ?? "…"}</span> day.
            </h1>
            <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-muted">
              {e.lastCall?.summary?.family_en.split(/(?<=\.)\s/).slice(0, 2).join(" ") ?? `No call yet today. KaiseHo calls ${n} at ${e.elder.callTimeLocal}.`}
            </p>
            {highlight && <HandNote className="mt-5 max-w-xl" by={`${n} · ${new Date(`${highlight.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}`}>{highlight.text}</HandNote>}
            <div className="mt-7 flex flex-wrap gap-2">
              <Button size="lg" icon={PhoneOutgoing} disabled={busy === "call"} onClick={() => act("call", `/elders/${e.elder.elderId}/call-now`)}>{busy === "call" ? "Ringing…" : `KaiseHo, call ${n}`}</Button>
              <Button size="lg" variant="secondary" icon={Play} disabled={busy === "play"} onClick={() => act("play", "/demo/play-call", { scam: true, elderId: e.elder.elderId })}>{busy === "play" ? "Playing…" : "Play demo call"}</Button>
              <Button size="lg" variant="ghost" icon={MessageSquareText} href="/app/family#messages">Leave a message</Button>
            </div>
          </div>
        </section>

        <section className="k-glass animate-fade-up relative flex flex-col items-center justify-center overflow-hidden rounded-[28px] border p-6 lg:col-span-4" style={{ animationDelay: ".08s" }}>
          <p className="k-label self-start text-muted">Wellbeing index · six dimensions</p>
          {w ? (
            <>
              <div className="relative mt-2 w-full max-w-[300px]">
                <Constellation w={w} />
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="font-display text-[3.4rem] leading-none font-semibold tracking-tight"><CountUp value={w.today?.index ?? 0} /></p>
                    <p className="k-label text-muted">today</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm"><span className="font-semibold">{STATUS_WORD[w.status]}</span>{w.baseline.n >= 5 ? <span className="text-muted"> · usual {w.baseline.mean}</span> : ""}</p>
              <Link href="/app/wellbeing" className="k-label mt-3 text-saffron hover:underline">See the patterns →</Link>
            </>
          ) : <Skeleton className="mt-4 size-64 rounded-full" />}
        </section>
      </div>

      {/* ---------- today in tiles ---------- */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Mood" icon={HeartPulse} tone="rose" value={mood ? <span className="flex items-center gap-2">{MOOD_EMOJI[mood]}<span className="text-[1.35rem]">{MOOD_WORD[mood]}</span></span> : "—"} foot={e.wellbeing?.highlight ? `“${e.wellbeing.highlight.slice(0, 48)}${e.wellbeing.highlight.length > 48 ? "…" : ""}”` : "from how she sounded"} />
        <Tile label="Sleep" icon={BedDouble} tone="navy" value={<span className="text-[1.45rem]">{e.wellbeing?.sleep ? SLEEP_WORD[e.wellbeing.sleep] : "—"}</span>} foot={e.wellbeing?.pain?.level ? `${e.wellbeing.pain.where} pain ${e.wellbeing.pain.level}/10` : "no pain mentioned"} />
        <Tile label="Medicines today" icon={Pill} tone={missed ? "danger" : "forest"} value={<span>{taken}<span className="text-lg text-muted">/{e.meds.length}</span></span>}
          foot={missed ? `${missed} missed · KaiseHo follows up` : e.adherence14d !== null ? `${e.adherence14d}% over 14 days` : "asked by name"}>
          <div className="mt-3 flex gap-1">{e.meds.map((m) => <span key={m.medId + m.slot} title={`${m.name} · ${m.slot}`} className={cx("h-1.5 flex-1 rounded-full", m.status === "taken" ? "bg-forest" : m.status === "missed" ? "bg-danger" : "bg-ink/15")} />)}</div>
        </Tile>
        <Tile label="Next call" icon={CalendarClock} tone="saffron" value={next || "…"} foot={`daily at ${e.elder.callTimeLocal}${e.lastCall?.at ? ` · last ${timeAgo(e.lastCall.at)}` : ""}`} />
      </div>

      {/* ---------- latest check-in + nudge ---------- */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader icon={PhoneCall} tone="saffron" kicker={e.lastCall?.at ? `Latest check-in · ${clock(e.lastCall.at)}` : "Latest check-in"} title="What she told KaiseHo"
            action={<Link href="/app/calls" className="inline-flex items-center gap-1 text-xs font-semibold text-saffron hover:underline">All calls <ArrowUpRight className="size-3.5" /></Link>} />
          {e.lastCall?.summary ? <SummaryBlock summary={e.lastCall.summary} dropcap /> : <p className="text-sm text-muted">No summary yet. Press “Play demo call” to see one appear live.</p>}
        </Card>
        <div className="lg:col-span-5"><NudgeCard nudge={e.nudge} starters={starters?.starters ?? []} elderId={e.elder.elderId} name={n} /></div>
      </div>

      {/* ---------- insights ---------- */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div><p className="k-label text-saffron">AI insights · from her own history</p><h2 className="mt-1 font-display text-[1.45rem] font-semibold tracking-tight">What the numbers say</h2></div>
          <Link href="/app/wellbeing" className="text-xs font-semibold text-saffron hover:underline">Wellbeing →</Link>
        </div>
        <InsightCards elderId={e.elder.elderId} wide />
      </div>

      {/* ---------- family + stories + mind ---------- */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8"><NeedsBoard elderId={e.elder.elderId} name={n} /></div>
        <div className="grid gap-5 lg:col-span-4">
          <LatestStoryTile elderId={e.elder.elderId} n={n} />
          <MindGymCard elderId={e.elder.elderId} name={n} compact />
        </div>
      </div>
    </div>
  );
}
