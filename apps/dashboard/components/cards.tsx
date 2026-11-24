"use client";
import { BedDouble, Bone, Check, CircleHelp, Clock, Lightbulb, MessageCircleHeart, Phone, PhoneCall, Pill, Smile, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { post, type CallSummary, type ElderCard, type FamilyCalls, type Nudge, type TodayView, type TrendPoint } from "@/lib/api";
import { MOOD_EMOJI, MOOD_WORD, shortDay, slotLabel, timeAgo } from "@/lib/format";
import { useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader, cx } from "./ui";

// ---------- family calls (headline metric) ----------
export function FamilyCallsCard({ stats, elderId, compact }: { stats: FamilyCalls; elderId: string; compact?: boolean }) {
  const { bump } = useLive();
  const [busy, setBusy] = useState(false);
  const diff = stats.thisWeek - stats.lastWeek;
  const max = Math.max(1, ...stats.byDay.map((d) => d.count));
  return (
    <Card tone="forest" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-saffron/15 blur-2xl" />
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Family calls this week</p>
      <div className="mt-2 flex items-end gap-3">
        <span className="font-display text-7xl leading-none font-semibold">{stats.thisWeek}</span>
        <span className={cx("mb-2 rounded-full px-2.5 py-1 text-xs font-bold", diff >= 0 ? "bg-[#2e9e5b] text-white" : "bg-white/15 text-white")}>
          {diff >= 0 ? "▲" : "▼"} {diff >= 0 ? "up" : "down"} from {stats.lastWeek}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/70">Our success metric: more human calls, not fewer.</p>
      {!compact && (
        <div className="mt-5 flex items-end gap-2">
          {stats.byDay.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-12 w-full items-end">
                <div className={cx("w-full rounded-md transition-all", d.count ? "bg-saffron" : "bg-white/10")} style={{ height: `${d.count ? 30 + (d.count / max) * 70 : 12}%` }} />
              </div>
              <span className="text-[10px] font-semibold text-white/50">{shortDay(d.date)}</span>
            </div>
          ))}
        </div>
      )}
      <Button variant="saffron" icon={Check} className="mt-5 w-full" disabled={busy}
        onClick={async () => { setBusy(true); await post(`/elders/${elderId}/family-call`, { by: "Ravi" }); bump(); setBusy(false); }}>
        I called her today
      </Button>
    </Card>
  );
}

// ---------- nudge + conversation starters ----------
export function NudgeCard({ nudge, starters, elderId, name }: { nudge?: Nudge | null; starters?: { starter: string; why: string }[]; elderId: string; name: string }) {
  const { bump } = useLive();
  const list = nudge?.starters?.length ? nudge.starters : starters ?? [];
  return (
    <Card tone="saffron" className="h-full">
      <CardHeader icon={Lightbulb} tone="saffron" kicker={nudge ? `Nudge · ${timeAgo(nudge.createdAt)}` : "Conversation starters"}
        title={<span className="font-display text-xl font-semibold sm:text-2xl">{nudge?.text ?? `Things to talk about with ${name} tonight`}</span>} />
      <ul className="grid gap-2.5 sm:grid-cols-3">
        {list.slice(0, 3).map((s, i) => (
          <li key={i} className="rounded-2xl bg-paper/80 p-3.5 ring-1 ring-saffron/25">
            <p className="text-sm leading-snug font-semibold">“{s.starter}”</p>
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted"><Sparkles className="size-3" />{s.why}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={Phone} href="tel:+910000000000">Call {name} yourself</Button>
        <Button variant="secondary" icon={Check} onClick={async () => { await post(`/elders/${elderId}/family-call`, { by: "Ravi" }); bump(); }}>I called her</Button>
      </div>
    </Card>
  );
}

// ---------- today ----------
const MED_STYLE: Record<string, { cls: string; icon: typeof Check; label: string }> = {
  taken: { cls: "bg-forest-soft text-forest ring-forest/20", icon: Check, label: "Taken" },
  missed: { cls: "bg-danger-soft text-danger ring-danger/25", icon: X, label: "Missed" },
  unsure: { cls: "bg-saffron-soft text-saffron-deep ring-saffron/30", icon: CircleHelp, label: "Not sure" },
  pending: { cls: "bg-paper text-muted ring-sand-deep", icon: Clock, label: "Not asked yet" },
};

export function MedsList({ meds }: { meds: TodayView["meds"] }) {
  if (!meds.length) return <p className="text-sm text-muted">No medicines shared.</p>;
  return (
    <ul className="space-y-2">
      {meds.map((m) => {
        const s = MED_STYLE[m.status];
        return (
          <li key={`${m.medId}-${m.slot}`} className="flex items-center justify-between gap-3 rounded-2xl bg-cream/60 px-3.5 py-2.5 ring-1 ring-sand">
            <span className="flex items-center gap-2.5 text-sm"><Pill className="size-4 text-t1" /><span className="font-semibold">{m.name}</span><span className="text-muted">· {slotLabel[m.slot] ?? m.slot}</span></span>
            <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1", s.cls)}><s.icon className="size-3.5" strokeWidth={3} />{s.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function TodayCard({ v }: { v: TodayView }) {
  const w = v.wellbeing;
  return (
    <Card className="h-full">
      <CardHeader icon={Smile} kicker={`Today · ${new Date(`${v.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}`} title="How she is today" />
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-saffron-soft/70 p-3 text-center">
          <div className="text-3xl">{w?.mood ? MOOD_EMOJI[w.mood] : "—"}</div>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">Mood</p>
          <p className="text-sm font-semibold">{w?.mood ? MOOD_WORD[w.mood] : "Not yet"}</p>
        </div>
        <div className="rounded-2xl bg-[#eef1fb] p-3 text-center">
          <BedDouble className="mx-auto size-7 text-navy" />
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Sleep</p>
          <p className="text-sm font-semibold capitalize">{w?.sleep ?? "Not yet"}</p>
        </div>
        <div className="rounded-2xl bg-forest-soft/70 p-3 text-center">
          <Bone className="mx-auto size-7 text-forest" />
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Pain</p>
          <p className="text-sm font-semibold capitalize">{w?.pain ? `${w.pain.where} ${w.pain.level}/10` : "None reported"}</p>
        </div>
      </div>
      <MedsList meds={v.meds} />
      {v.followUps.length > 0 && (
        <div className="mt-4 rounded-2xl bg-cream p-3.5 ring-1 ring-sand">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-saffron-deep"><MessageCircleHeart className="size-3.5" />KaiseHo will follow up on</p>
          <ul className="mt-1.5 space-y-1 text-sm">{v.followUps.map((f) => <li key={f}>• {f}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

// ---------- call summary ----------
export function SummaryBlock({ summary, lang = "kn" }: { summary: CallSummary; lang?: string }) {
  const [native, setNative] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-sand/50 p-0.5 text-xs font-semibold">
          <button onClick={() => setNative(false)} className={cx("rounded-md px-2.5 py-1", !native && "bg-paper shadow-sm")}>English</button>
          <button onClick={() => setNative(true)} className={cx("rounded-md px-2.5 py-1", native && "bg-paper shadow-sm")}>{lang === "hi" ? "हिन्दी" : "ಕನ್ನಡ"}</button>
        </div>
        <Badge tone={summary.source === "llm" ? "navy" : "neutral"}>{summary.source === "llm" ? "AI summary" : "Rules summary"}</Badge>
      </div>
      <p className="text-[15px] leading-relaxed">{native ? summary.family_native : summary.family_en}</p>
      {summary.highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.highlights.map((h) => <Badge key={h} tone={/scam|missed|emergency/i.test(h) ? "danger" : /✓|better|heard/i.test(h) ? "forest" : "neutral"}>{h}</Badge>)}
        </div>
      )}
    </div>
  );
}

// ---------- charts ----------
const tick = { fontSize: 11, fill: "#6b6459" };
export function MoodPainChart({ data, height = 220 }: { data: { date: string; mood: number | null; pain: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fd9b36" stopOpacity={0.45} /><stop offset="100%" stopColor="#fd9b36" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid stroke="#ede3cf" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => new Date(`${d}T00:00:00`).getDate().toString()} tick={tick} axisLine={false} tickLine={false} />
        <YAxis yAxisId="mood" domain={[0, 5]} ticks={[1, 3, 5]} tick={tick} axisLine={false} tickLine={false} />
        <YAxis yAxisId="pain" orientation="right" domain={[0, 10]} hide />
        <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #ede3cf", fontSize: 12 }} labelFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          formatter={(v, n) => [n === "mood" ? `${v}/5 ${MOOD_EMOJI[Number(v)] ?? ""}` : `${v}/10`, n === "mood" ? "Mood" : "Knee pain"]} />
        <Area yAxisId="mood" type="monotone" dataKey="mood" stroke="#e0821f" strokeWidth={2.5} fill="url(#moodFill)" dot={{ r: 3, fill: "#fd9b36", strokeWidth: 0 }} connectNulls isAnimationActive={false} />
        <Line yAxisId="pain" type="monotone" dataKey="pain" stroke="#1f5c3d" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function AdherenceChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#ede3cf" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => new Date(`${d}T00:00:00`).getDate().toString()} tick={tick} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #ede3cf", fontSize: 12 }} />
        <Bar dataKey="taken" stackId="a" fill="#2e9e5b" radius={[0, 0, 4, 4]} name="Taken" isAnimationActive={false} />
        <Bar dataKey="missed" stackId="a" fill="#c62828" radius={[4, 4, 0, 0]} name="Missed" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LiveCallChip({ card }: { card: ElderCard }) {
  if (!card.liveCall) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-saffron px-3 py-1 text-xs font-bold text-ink">
      <PhoneCall className="size-3.5" />{card.liveCall.status === "ringing" ? "Ringing…" : "On a call now"}{card.liveCall.mode === "simulated" && " (simulated)"}
    </span>
  );
}
