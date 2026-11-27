"use client";
import { Activity, ArrowUpRight, CalendarClock, MessageSquareText, PhoneCall, PhoneOutgoing, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DigestCard } from "@/components/DigestCard";
import { Constellation, DAY_WORD, IndexRiver, InsightCards, NeedsCard, RotaCard, STATUS_WORD, type Wellbeing } from "@/components/Insight";
import { LiveCallChip, NudgeCard, SummaryBlock, TodayCard } from "@/components/cards";
import { Avatar, Badge, Button, Card, CardHeader, CountUp, Empty, HandNote, SectionHead, Skeleton, cx } from "@/components/ui";
import { post, type Overview } from "@/lib/api";
import { toFeed } from "@/lib/events";
import { clock, greeting, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

function ActivityFeed() {
  const { events } = useLive();
  const items = events.map(toFeed).filter((x) => x && x.kind !== "speech-agent" && x.kind !== "speech-elder").reverse().slice(0, 7);
  return (
    <Card className="h-full">
      <CardHeader icon={Activity} tone="teal" kicker="As it happens" title="What KaiseHo is doing" action={<Link href="/live" className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline">Live Ops <ArrowUpRight className="size-3.5" /></Link>} />
      {items.length === 0 ? (
        <Empty icon={Activity} title="Quiet for now">Tool calls, alerts and summaries appear here the moment they happen.</Empty>
      ) : (
        <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[6px] before:w-px before:bg-sand-deep">
          {items.map((it) => (
            <li key={it!.id} className="animate-slide-in relative pl-6">
              <span className={cx("absolute top-1.5 left-0 size-[13px] rounded-full ring-[3px] ring-paper",
                it!.kind === "alert-urgent" ? "bg-danger" : it!.tier === "T3" ? "bg-t3" : it!.tier === "T2" ? "bg-t2" : it!.tier === "T1" ? "bg-t1" : it!.kind === "ack" || it!.kind === "summary" ? "bg-forest" : "bg-sand-deep")} />
              <p className="text-[13.5px] leading-snug font-medium">{it!.text}</p>
              <p className="text-[11.5px] text-muted">{clock(it!.ts)}{it!.detail ? ` · ${it!.detail.slice(0, 70)}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const { data, error } = useApi<Overview>("/family/overview");
  const { bump } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const e = data?.elders.find((x) => x.elder.elderId === pick) ?? data?.elders.find((x) => x.elder.status !== "pending_consent") ?? data?.elders[0];
  const id = e?.elder.elderId ?? null;
  const { data: w } = useApi<Wellbeing>(id ? `/elders/${id}/wellbeing` : null);
  const { data: starters } = useApi<{ starters: { starter: string; why: string }[] }>(id ? `/elders/${id}/starters` : null);

  const act = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    try { await post(path, body); bump(); } finally { setTimeout(() => setBusy(null), 1200); }
  };

  if (error) return <Empty icon={ShieldCheck} title="Can't reach the KaiseHo server">Start it with <code>pnpm dev</code> ({error}).</Empty>;
  if (!data || !e) return <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /><Skeleton className="h-80 lg:col-span-3" /></div>;
  const n = e.elder.preferredName;
  const weekday = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  const word = w ? DAY_WORD(w.status, w.today?.index ?? null) : null;
  const highlight = w?.highlights.at(-1);

  return (
    <div className="space-y-6">
      {/* ---------- front page ---------- */}
      <section className="animate-fade-up relative overflow-hidden rounded-[28px] border border-sand bg-paper px-5 pt-6 pb-5 shadow-[var(--shadow-card)] sm:px-9 sm:pt-9">
        <div className="k-kolam pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-saffron-deep uppercase">{greeting()}, Ravi · the family edition</p>
            <h1 className="mt-3 font-display text-[2.6rem] leading-[1.02] font-medium tracking-tight sm:text-[3.6rem]">
              {n} had a <span className="k-wonk text-saffron-deep">{word ?? "…"}</span> {weekday}.
            </h1>
            <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-muted">
              {e.lastCall?.summary?.family_en.split(/(?<=\.)\s/).slice(0, 2).join(" ") ?? `No call yet today. KaiseHo calls ${n} at ${e.elder.callTimeLocal}.`}
            </p>
            {highlight && <HandNote className="mt-5" by={`${n}, ${new Date(`${highlight.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}`}>{highlight.text}</HandNote>}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button icon={PhoneOutgoing} disabled={busy === "call"} onClick={() => act("call", `/elders/${e.elder.elderId}/call-now`)}>{busy === "call" ? "Ringing…" : `KaiseHo, call ${n}`}</Button>
              <Button variant="secondary" icon={Play} disabled={busy === "play"} onClick={() => act("play", "/demo/play-call", { scam: true, elderId: e.elder.elderId })}>{busy === "play" ? "Playing…" : "Play demo call"}</Button>
              <Button variant="ghost" icon={MessageSquareText} href={`/elder/${e.elder.elderId}#messages`}>Leave a message</Button>
            </div>
          </div>
          <div className="relative flex flex-col items-center">
            {w ? (
              <>
                <div className="relative w-full max-w-[320px]">
                  <Constellation w={w} />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="font-display text-[3.2rem] leading-none font-medium"><CountUp value={w.today?.index ?? 0} /></p>
                      <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">wellbeing</p>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-center text-sm text-muted"><span className="font-semibold text-ink">{STATUS_WORD[w.status]}</span>{w.baseline.n >= 5 ? ` · her usual is ${w.baseline.mean}` : ""}</p>
                <p className="text-center text-[11px] text-muted">this week <span className="text-saffron-deep">━</span> vs last week <span className="opacity-60">┅</span></p>
              </>
            ) : <Skeleton className="size-72 rounded-full" />}
          </div>
        </div>
        {data.elders.length > 1 && (
          <div className="relative mt-6 flex flex-wrap gap-2 border-t border-sand pt-4">
            {data.elders.map((x) => (
              <button key={x.elder.elderId} onClick={() => setPick(x.elder.elderId)}
                className={cx("flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm font-medium ring-1 transition", x.elder.elderId === e.elder.elderId ? "bg-ink text-cream ring-ink" : "bg-paper ring-sand-deep hover:bg-sand/40")}>
                <Avatar name={x.elder.name} ring={x.ring} size={26} />{x.elder.name} {x.elder.preferredName}
                {x.elder.status === "pending_consent" && <Badge tone="saffron">awaiting consent</Badge>}
              </button>
            ))}
          </div>
        )}
      </section>

      {e.elder.status === "pending_consent" && (
        <Card tone="saffron">
          <div className="flex flex-wrap items-center gap-4">
            <ShieldCheck className="size-8 text-forest" />
            <div className="min-w-0 flex-1"><p className="font-display text-lg">Waiting for {n}&apos;s consent</p><p className="text-sm text-muted">No daily calls are scheduled until {n} says yes in the welcome call.</p></div>
            <Button icon={PhoneCall} onClick={() => act("welcome", `/elders/${e.elder.elderId}/welcome-call`)}>Make the welcome call</Button>
          </div>
        </Card>
      )}

      {/* ---------- insights ---------- */}
      <SectionHead n="01" title="What the numbers say" sub="patterns from her own history, never a diagnosis" />
      <InsightCards elderId={e.elder.elderId} wide />

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader icon={Activity} tone="saffron" kicker="30 days · hover any day" title={`${n}'s wellbeing, day by day`} />
          {w ? <IndexRiver w={w} /> : <Skeleton className="h-40" />}
        </Card>
        <div className="lg:col-span-4"><RotaCard elderId={e.elder.elderId} name={n} /></div>
      </div>

      {/* ---------- today ---------- */}
      <SectionHead n="02" title="Today" sub={`${e.elder.age} · ${e.elder.city}`} action={<Link href={`/elder/${e.elder.elderId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">{n}&apos;s full page <ArrowUpRight className="size-4" /></Link>} />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={e.elder.name} ring={e.ring} size={64} pulse={Boolean(e.liveCall)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-medium">{e.elder.name} {n}</h2>
                <LiveCallChip card={e} />
                {e.ring === "green" && !e.liveCall && <Badge tone="forest">Called · all fine today</Badge>}
                {e.ring === "amber" && <Badge tone="saffron">Worth a look</Badge>}
                {e.ring === "red" && <Badge tone="danger">Needs attention</Badge>}
                {e.ring === "grey" && <Badge>Not called yet today</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />Daily at <b className="text-ink">{e.elder.callTimeLocal}</b></span>
                {e.lastCall?.at && <span className="inline-flex items-center gap-1"><PhoneCall className="size-3.5" />Last call {timeAgo(e.lastCall.at)}</span>}
              </div>
            </div>
          </div>
          <hr className="k-rule my-5" />
          <p className="mb-2 text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">The latest check-in</p>
          {e.lastCall?.summary ? <SummaryBlock summary={e.lastCall.summary} dropcap /> : <p className="text-sm text-muted">No summary yet.</p>}
        </Card>
        <div className="lg:col-span-5"><TodayCard v={e} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><NudgeCard nudge={e.nudge} starters={starters?.starters ?? []} elderId={e.elder.elderId} name={n} /></div>
        <div className="lg:col-span-5"><NeedsCard elderId={e.elder.elderId} name={n} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><DigestCard elderId={e.elder.elderId} name={n} /></div>
        <div className="lg:col-span-5"><ActivityFeed /></div>
      </div>
    </div>
  );
}
