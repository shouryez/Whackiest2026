"use client";
import { Activity, CalendarClock, ChevronRight, MessageSquareText, PhoneCall, PhoneOutgoing, Play, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FamilyCallsCard, LiveCallChip, MoodPainChart, NudgeCard, SummaryBlock, TodayCard } from "@/components/cards";
import { Avatar, Badge, Button, Card, CardHeader, Empty, Skeleton, cx } from "@/components/ui";
import { post, type Overview } from "@/lib/api";
import { toFeed } from "@/lib/events";
import { clock, greeting, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

function ActivityFeed() {
  const { events } = useLive();
  const items = events.map(toFeed).filter((x) => x && x.kind !== "speech-agent" && x.kind !== "speech-elder").reverse().slice(0, 7);
  return (
    <Card className="h-full">
      <CardHeader icon={Activity} kicker="Live" title="What KaiseHo is doing" action={<Link href="/live" className="text-xs font-semibold text-forest hover:underline">Open Live Ops →</Link>} />
      {items.length === 0 ? (
        <Empty icon={Activity} title="Quiet for now">Tool calls, alerts and summaries appear here the moment they happen.</Empty>
      ) : (
        <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-sand">
          {items.map((it) => (
            <li key={it!.id} className="animate-slide-in relative pl-6">
              <span className={cx("absolute top-1.5 left-0 size-[15px] rounded-full border-[3px] border-paper",
                it!.kind === "alert-urgent" ? "bg-danger" : it!.tier === "T3" ? "bg-t3" : it!.tier === "T2" ? "bg-t2" : it!.tier === "T1" ? "bg-t1" : it!.kind === "ack" || it!.kind === "summary" ? "bg-[#2e9e5b]" : "bg-sand-deep")} />
              <p className="text-sm leading-snug font-semibold">{it!.text}</p>
              <p className="text-xs text-muted">{clock(it!.ts)}{it!.detail ? ` · ${it!.detail.slice(0, 70)}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const { data, error } = useApi<Overview>("/family/overview");
  const { data: starters } = useApi<{ starters: { starter: string; why: string }[] }>("/elders/eld_lakshmi/starters");
  const { bump } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const e = data?.elders[0];

  const act = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    try { await post(path, body); bump(); } finally { setTimeout(() => setBusy(null), 1200); }
  };

  if (error) return <Empty icon={ShieldCheck} title="Can't reach the KaiseHo server">Start it with <code>pnpm dev</code> ({error}).</Empty>;
  if (!data || !e) return <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>;

  return (
    <div className="space-y-5">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-saffron-deep">{greeting()}, Ravi 👋</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-[42px] sm:leading-tight">
            Here's how <span className="text-forest">{e.elder.preferredName}</span> is doing
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Play} disabled={busy === "play"} onClick={() => act("play", "/demo/play-call", { scam: true })}>
            {busy === "play" ? "Calling…" : "Play demo call"}
          </Button>
          <Button icon={PhoneOutgoing} disabled={busy === "call"} onClick={() => act("call", `/elders/${e.elder.elderId}/call-now`)}>
            {busy === "call" ? "Ringing…" : `Call ${e.elder.preferredName} now`}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4"><FamilyCallsCard stats={e.familyCalls} elderId={e.elder.elderId} /></div>
        <div className="lg:col-span-8"><NudgeCard nudge={e.nudge} starters={starters?.starters} elderId={e.elder.elderId} name={e.elder.preferredName} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={e.elder.name} ring={e.ring} size={72} pulse={Boolean(e.liveCall)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-semibold">{e.elder.name} {e.elder.preferredName}</h2>
                <LiveCallChip card={e} />
                {e.ring === "green" && !e.liveCall && <Badge tone="forest">Called · all fine today</Badge>}
                {e.ring === "amber" && <Badge tone="saffron">Worth a look</Badge>}
                {e.ring === "red" && <Badge tone="danger">Needs attention</Badge>}
                {e.ring === "grey" && <Badge>Not called yet today</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted">{e.elder.age} · {e.elder.city} · speaks {e.elder.languages.map((l) => ({ kn: "Kannada", hi: "Hindi", en: "English" })[l] ?? l).join(" & ")}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />Daily call at <b className="text-ink">{e.elder.callTimeLocal}</b> {e.elder.status !== "active" && <Badge tone="saffron">{e.elder.status}</Badge>}</span>
                {e.lastCall?.at && <span className="inline-flex items-center gap-1"><PhoneCall className="size-3.5" />Last call {timeAgo(e.lastCall.at)}</span>}
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-cream/70 p-4 ring-1 ring-sand">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Latest check-in</p>
            {e.lastCall?.summary ? <SummaryBlock summary={e.lastCall.summary} /> : <p className="text-sm text-muted">No summary yet.</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon={MessageSquareText} href={`/elder/${e.elder.elderId}#messages`}>Leave a message</Button>
            <Button variant="ghost" href={`/elder/${e.elder.elderId}`}>Open {e.elder.preferredName}'s page <ChevronRight className="size-4" /></Button>
          </div>
        </Card>
        <div className="lg:col-span-5"><TodayCard v={e} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader icon={TrendingUp} kicker="Last 14 days · demo history + live calls" title="Mood and knee pain"
            action={<div className="flex gap-3 text-xs text-muted"><span className="flex items-center gap-1"><span className="h-1 w-4 rounded bg-saffron" />Mood</span><span className="flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-forest" />Pain</span></div>} />
          <MoodPainChart data={e.trend} />
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-sand pt-4 text-center">
            <div><p className="font-display text-2xl font-semibold text-forest">{e.adherence14d ?? "—"}%</p><p className="text-xs text-muted">medicines taken</p></div>
            <div><p className="font-display text-2xl font-semibold">{e.trend.filter((t) => t.mood !== null && t.mood <= 2).length}</p><p className="text-xs text-muted">low-mood days</p></div>
            <div><p className="font-display text-2xl font-semibold text-saffron-deep">{e.trend.at(-1)?.pain ?? "—"}/10</p><p className="text-xs text-muted">knee pain now</p></div>
          </div>
        </Card>
        <div className="lg:col-span-4"><ActivityFeed /></div>
      </div>
    </div>
  );
}
