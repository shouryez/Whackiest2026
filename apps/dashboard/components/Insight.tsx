"use client";
import { CheckCheck, Flame, Heart, HeartHandshake, Lightbulb, Loader2, Mic, PartyPopper, Plus, QrCode, RefreshCw, ShoppingBasket, Sparkles, Square, TriangleAlert, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API, api, post } from "@/lib/api";
import { dayLabel } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader, CountUp, HandNote, Skeleton, cx } from "./ui";

// ---------- types (mirror the server's read models) ----------
export interface Wellbeing {
  today: { date: string; index: number | null; highlight?: string } | null;
  baseline: { mean: number; sd: number; n: number };
  delta: number;
  status: "learning" | "well_below" | "below" | "usual" | "better";
  dims: { dim: string; label: string; now: number | null; before: number | null; change: number | null }[];
  patterns: { id: string; kind: string; title: string; detail: string; strength: string }[];
  voice: { wpm: number; replyGapSec: number } | null;
  series: { date: string; index: number | null; mood: number | null; pain: number | null; familyCall: boolean; highlight: string | null }[];
  highlights: { date: string; text: string }[];
}
interface Cards { cards: { kind: "celebrate" | "pattern" | "watch" | "action"; title: string; insight: string; suggestion: string }[]; source: "llm" | "rules"; generatedAt: string }

export const STATUS_WORD: Record<Wellbeing["status"], string> = { learning: "getting to know her", well_below: "well below her usual", below: "a little below her usual", usual: "like her usual self", better: "brighter than usual" };
export const DAY_WORD = (s: Wellbeing["status"], idx: number | null) =>
  s === "better" || (idx ?? 0) >= 80 ? "bright" : s === "well_below" ? "difficult" : s === "below" ? "quieter" : (idx ?? 0) >= 65 ? "good" : "steady";

// ---------- the wellbeing constellation ----------
/** Six dimensions as a constellation: this week (solid, glowing stars) over last week (dashed). */
export function Constellation({ w, size = 300 }: { w: Wellbeing; size?: number }) {
  const c = size / 2, R = size * 0.36;
  const pts = (key: "now" | "before") => w.dims.map((d, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / w.dims.length;
    const v = (d[key] ?? 0) / 100;
    return [c + Math.cos(a) * R * Math.max(0.08, v), c + Math.sin(a) * R * Math.max(0.08, v)] as const;
  });
  const now = pts("now"), before = pts("before");
  const path = (p: readonly (readonly [number, number])[]) => p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z";
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px]" role="img" aria-label="Wellbeing across six dimensions, this week versus last week">
      <defs>
        <radialGradient id="k-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="var(--k-saffron)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--k-saffron)" stopOpacity="0" /></radialGradient>
      </defs>
      {[0.33, 0.66, 1].map((r) => <circle key={r} cx={c} cy={c} r={R * r} fill="none" stroke="var(--k-line)" strokeDasharray={r === 1 ? "0" : "2 4"} />)}
      {w.dims.map((d, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / w.dims.length;
        const lx = c + Math.cos(a) * (R + 26), ly = c + Math.sin(a) * (R + 22);
        return (
          <g key={d.dim}>
            <line x1={c} y1={c} x2={c + Math.cos(a) * R} y2={c + Math.sin(a) * R} stroke="var(--k-line)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10.5px] font-semibold tracking-wider uppercase">{d.label}</text>
            {d.change !== null && Math.abs(d.change) >= 8 && (
              <text x={lx} y={ly + 13} textAnchor="middle" className={cx("text-[10px] font-bold", d.change > 0 ? "fill-forest" : "fill-rust")}>{d.change > 0 ? "▲" : "▼"} {Math.abs(d.change)}</text>
            )}
          </g>
        );
      })}
      <path d={path(before)} fill="none" stroke="var(--k-muted)" strokeOpacity="0.55" strokeDasharray="3 4" />
      <circle cx={c} cy={c} r={R * 0.9} fill="url(#k-glow)" />
      <path d={path(now)} fill="color-mix(in oklab, var(--k-saffron) 16%, transparent)" stroke="var(--k-saffron-deep)" strokeWidth="1.8" strokeLinejoin="round" className="animate-draw" style={{ ["--len" as string]: 1400 }} />
      {now.map(([x, y], i) => (
        <g key={i} className="animate-pop" style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
          <circle cx={x} cy={y} r="7" fill="var(--k-saffron)" opacity="0.25" className="animate-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
          <circle cx={x} cy={y} r="3.4" fill="var(--k-saffron-deep)" />
        </g>
      ))}
    </svg>
  );
}

/** 30 days of the index as a river: her normal band, family calls as hearts, good moments as stars. */
export function IndexRiver({ w, height = 150 }: { w: Wellbeing; height?: number }) {
  const width = 640, pad = 8;
  // Start at the first day with data (new families don't get an empty left half).
  const first = Math.max(0, w.series.findIndex((d) => d.index !== null) - 1);
  const series = w.series.slice(first);
  const pts = series.map((d, i) => ({ ...d, x: pad + (i * (width - 2 * pad)) / Math.max(1, series.length - 1) }));
  const y = (v: number) => height - 18 - (v / 100) * (height - 34);
  const known = pts.filter((p) => p.index !== null);
  const line = known.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${y(p.index!).toFixed(1)}`).join(" ");
  const area = known.length ? `${line} L${known.at(-1)!.x},${height - 18} L${known[0].x},${height - 18} Z` : "";
  const lo = Math.max(0, w.baseline.mean - w.baseline.sd), hi = Math.min(100, w.baseline.mean + w.baseline.sd);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? pts[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" onMouseLeave={() => setHover(null)} role="img" aria-label="Wellbeing index over the last 30 days">
        <defs>
          <linearGradient id="k-river" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--k-saffron)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--k-saffron)" stopOpacity="0" /></linearGradient>
        </defs>
        {w.baseline.n >= 5 && <rect x={pad} width={width - 2 * pad} y={y(hi)} height={Math.max(2, y(lo) - y(hi))} fill="var(--k-forest)" opacity="0.09" rx="4" />}
        {w.baseline.n >= 5 && <line x1={pad} x2={width - pad} y1={y(w.baseline.mean)} y2={y(w.baseline.mean)} stroke="var(--k-forest)" strokeOpacity="0.45" strokeDasharray="4 5" />}
        <path d={area} fill="url(#k-river)" />
        <path d={line} fill="none" stroke="var(--k-saffron-deep)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" style={{ ["--len" as string]: 2400 }} />
        {pts.map((p, i) => (
          <g key={p.date}>
            <rect x={p.x - 9} y={0} width={18} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            {p.familyCall && <text x={p.x} y={height - 3} textAnchor="middle" className="fill-rust text-[11px]">♥</text>}
            {p.index !== null && p.highlight && <circle cx={p.x} cy={y(p.index)} r="3.6" fill="var(--k-surface)" stroke="var(--k-saffron-deep)" strokeWidth="2" />}
          </g>
        ))}
        {h && h.index !== null && <circle cx={h.x} cy={y(h.index)} r="5" fill="var(--k-saffron-deep)" />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-sand bg-paper px-3 py-2 text-xs shadow-[var(--shadow-lift)]" style={{ left: `clamp(0px, calc(${(h.x / width) * 100}% - 80px), calc(100% - 170px))` }}>
          <p className="font-semibold">{dayLabel(h.date)} · <span className="tabular">{h.index ?? "—"}</span></p>
          {h.highlight && <p className="font-hand text-[15px] leading-tight text-saffron-deep">“{h.highlight}”</p>}
          {h.familyCall && <p className="text-rust">♥ a family call</p>}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-saffron-deep" />Wellbeing index</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-forest/15" />Her usual range</span>
        <span className="flex items-center gap-1.5"><span className="text-rust">♥</span>Family call</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-saffron-deep" />A good moment</span>
      </div>
    </div>
  );
}

// ---------- AI suggestions ----------
const KIND = {
  celebrate: { icon: PartyPopper, tone: "forest" as const, label: "Going well" },
  pattern: { icon: Sparkles, tone: "navy" as const, label: "Pattern" },
  watch: { icon: TriangleAlert, tone: "saffron" as const, label: "Keep an eye" },
  action: { icon: Lightbulb, tone: "teal" as const, label: "Do this" },
};
export function InsightCards({ elderId, wide }: { elderId: string; wide?: boolean }) {
  const { data, reload } = useApi<Cards>(`/elders/${elderId}/insights`);
  const [busy, setBusy] = useState(false);
  return (
    <Card crown className="pt-7">
      <CardHeader icon={Sparkles} tone="saffron" kicker={data?.source === "llm" ? "Written by Gemini from her numbers" : "From her numbers"} title="What to know, and what to do"
        action={<Button size="sm" variant="ghost" icon={busy ? Loader2 : RefreshCw} onClick={async () => { setBusy(true); try { await api(`/elders/${elderId}/insights?fresh=1`); reload(); } finally { setBusy(false); } }}>Refresh</Button>} />
      {!data ? <Skeleton className="h-40" /> : (
        <ol className={cx("stagger grid gap-3", wide ? "md:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2")}>
          {data.cards.map((c, i) => {
            const K = KIND[c.kind] ?? KIND.pattern;
            return (
              <li key={i} className="group relative rounded-[18px] border border-sand bg-paper-2/70 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-2"><Badge tone={K.tone}><K.icon className="size-3" />{K.label}</Badge><span className="k-wonk font-display text-2xl text-sand-deep tabular">{String(i + 1).padStart(2, "0")}</span></div>
                <h3 className="mt-2 font-display text-[1.12rem] leading-snug font-medium">{c.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{c.insight}</p>
                <p className="mt-3 flex gap-2 border-t border-dashed border-sand-deep pt-3 text-[13.5px] font-medium"><HeartHandshake className="mt-0.5 size-4 shrink-0 text-forest" />{c.suggestion}</p>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-[11px] text-muted">Grounded only in the statistics on this page. Never a diagnosis; health items say “worth mentioning to her doctor”.</p>
    </Card>
  );
}

export function PatternList({ w }: { w: Wellbeing }) {
  if (!w.patterns.length) return <p className="text-sm text-muted">Patterns appear after about a week of check-ins.</p>;
  return (
    <ul className="space-y-3">
      {w.patterns.map((p) => (
        <li key={p.id} className="flex gap-3">
          <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", p.kind === "watch" ? "bg-saffron" : p.kind === "good" ? "bg-forest" : p.kind === "connection" ? "bg-rust" : "bg-navy")} />
          <div>
            <p className="font-display text-[1.02rem] leading-snug">{p.title} {p.strength === "strong" && <Badge tone="neutral" className="ml-1 align-middle">strong</Badge>}</p>
            <p className="text-[13px] leading-relaxed text-muted">{p.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- home readings ----------
interface VitalKind { kind: string; label: string; unit: string; count: number; latest: { text: string; status: string; date: string } | null; avg: number; avg2?: number; min: number; max: number; outOfRange: number; series: { date: string; value: number; value2?: number; status: string }[] }
interface Vitals { targets: { sugarFasting: [number, number]; bpSystolic: [number, number]; bpDiastolic: [number, number] }; tracked: string[]; kinds: VitalKind[] }

function SugarChart({ k, band }: { k: VitalKind; band: [number, number] }) {
  const W = 320, H = 120, lo = Math.min(60, k.min - 10), hi = Math.max(200, k.max + 10);
  const x = (i: number) => 10 + (i * (W - 20)) / Math.max(1, k.series.length - 1);
  const y = (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 26);
  const line = k.series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fasting sugar readings against her target range">
      <rect x="6" width={W - 12} y={y(band[1])} height={y(band[0]) - y(band[1])} rx="6" fill="var(--k-forest)" opacity="0.1" />
      <text x={W - 10} y={y(band[1]) - 4} textAnchor="end" className="fill-forest text-[9px] font-semibold">target {band[0]}–{band[1]}</text>
      <path d={line} fill="none" stroke="var(--k-rust)" strokeWidth="2" strokeLinejoin="round" className="animate-draw" style={{ ["--len" as string]: 900 }} />
      {k.series.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={p.status === "normal" ? 2.6 : 4} fill={p.status === "normal" ? "var(--k-surface)" : "var(--k-rust)"} stroke="var(--k-rust)" strokeWidth="1.6"><title>{`${p.date}: ${p.value}`}</title></circle>)}
    </svg>
  );
}

function BpChart({ k, t }: { k: VitalKind; t: Vitals["targets"] }) {
  const W = 320, H = 120, lo = 50, hi = 200;
  const y = (v: number) => H - 12 - ((v - lo) / (hi - lo)) * (H - 22);
  const step = (W - 30) / Math.max(1, k.series.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Blood pressure readings as ranges">
      <line x1="6" x2={W - 6} y1={y(t.bpSystolic[1])} y2={y(t.bpSystolic[1])} stroke="var(--k-rust)" strokeDasharray="3 4" opacity="0.6" />
      <line x1="6" x2={W - 6} y1={y(t.bpDiastolic[1])} y2={y(t.bpDiastolic[1])} stroke="var(--k-navy)" strokeDasharray="3 4" opacity="0.6" />
      {k.series.map((p, i) => {
        const cxp = 18 + i * step + step / 2;
        const high = p.status !== "normal";
        return (
          <g key={i}>
            <line x1={cxp} x2={cxp} y1={y(p.value)} y2={y(p.value2 ?? p.value)} stroke={high ? "var(--k-rust)" : "var(--k-navy)"} strokeWidth="6" strokeLinecap="round" opacity={high ? 1 : 0.75}><title>{`${p.date}: ${p.value}/${p.value2}`}</title></line>
          </g>
        );
      })}
    </svg>
  );
}

export function VitalsCard({ elderId }: { elderId: string }) {
  const { data } = useApi<Vitals>(`/elders/${elderId}/vitals?days=30`);
  if (!data) return <Skeleton className="h-72" />;
  const sugar = data.kinds.find((k) => k.kind === "sugar"), bp = data.kinds.find((k) => k.kind === "bp");
  return (
    <Card>
      <CardHeader icon={Flame} tone="danger" kicker="She tells KaiseHo in the call" title="Home readings" />
      {!data.kinds.length ? <p className="text-sm text-muted">No readings yet. If she checks sugar or BP at home, KaiseHo asks for it casually.</p> : (
        <div className="grid gap-5 sm:grid-cols-2">
          {sugar && (
            <div>
              <div className="flex items-baseline justify-between"><p className="text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">Sugar · fasting</p>{sugar.outOfRange > 0 && <Badge tone="saffron">{sugar.outOfRange} high</Badge>}</div>
              <p className="font-display text-[2.2rem] leading-none font-medium tabular"><CountUp value={sugar.latest?.text ? Number(sugar.latest.text.match(/\d+/)?.[0] ?? 0) : 0} /> <span className="text-sm text-muted">mg/dL</span></p>
              <SugarChart k={sugar} band={data.targets.sugarFasting} />
              <p className="text-[11.5px] text-muted">Average {sugar.avg} · range {sugar.min}–{sugar.max} · {sugar.count} readings</p>
            </div>
          )}
          {bp && (
            <div>
              <div className="flex items-baseline justify-between"><p className="text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">Blood pressure</p>{bp.outOfRange > 0 && <Badge tone="saffron">{bp.outOfRange} high</Badge>}</div>
              <p className="font-display text-[2.2rem] leading-none font-medium tabular">{bp.latest?.text.match(/\d+\/\d+/)?.[0] ?? "—"} <span className="text-sm text-muted">mmHg</span></p>
              <BpChart k={bp} t={data.targets} />
              <p className="text-[11.5px] text-muted">Average {bp.avg}/{bp.avg2} · dashed lines are her targets</p>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">Out-of-range readings go to Ravi; dangerous ones trigger the emergency path. KaiseHo never interprets readings or suggests medicines.</p>
    </Card>
  );
}

// ---------- household needs + gas ----------
interface Need { needId: string; item: string; category: string; status: "open" | "claimed" | "done"; claimedBy?: string; createdAt: string; source: string; urgency: string }
const CAT: Record<string, string> = { groceries: "🌾", medicine: "💊", gas: "🔥", household: "🧴", repair: "🔧", other: "📦" };

function GasGauge({ g }: { g: { daysSince: number; intervalDays: number; daysLeft: number } }) {
  const left = Math.max(0, Math.min(1, g.daysLeft / g.intervalDays));
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-sand bg-paper-2/70 p-3">
      <svg viewBox="0 0 40 60" className="h-14 w-10 shrink-0" aria-hidden>
        <rect x="14" y="2" width="12" height="6" rx="2" fill="var(--k-line-strong)" />
        <rect x="6" y="8" width="28" height="48" rx="10" fill="var(--k-surface)" stroke="var(--k-line-strong)" strokeWidth="2" />
        <clipPath id="k-cyl"><rect x="8" y="10" width="24" height="44" rx="8" /></clipPath>
        <rect x="8" y={10 + 44 * (1 - left)} width="24" height={44 * left} fill={left < 0.2 ? "var(--k-rust)" : "var(--k-saffron)"} clipPath="url(#k-cyl)" className="transition-all duration-700" />
      </svg>
      <div className="text-sm">
        <p className="font-semibold">Gas cylinder: {g.daysLeft <= 0 ? "due now" : `~${g.daysLeft} days left`}</p>
        <p className="text-xs text-muted">Refilled {g.daysSince} days ago · usually lasts {g.intervalDays}. KaiseHo asks her when it's close.</p>
      </div>
    </div>
  );
}

export function NeedsCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ needs: Need[]; gas: { daysSince: number; intervalDays: number; daysLeft: number } | null }>(`/elders/${elderId}/needs`);
  const { bump } = useLive();
  const [item, setItem] = useState("");
  const act = async (id: string, a: "claim" | "done") => { await post(`/elders/${elderId}/needs/${id}/${a}`); reload(); bump(); };
  const list = (data?.needs ?? []).filter((n) => n.status !== "done").concat((data?.needs ?? []).filter((n) => n.status === "done").slice(0, 2));
  return (
    <Card>
      <CardHeader icon={ShoppingBasket} tone="saffron" kicker={`From ${name}'s calls · shared with siblings`} title="Things she needs" />
      {data?.gas && <div className="mb-3"><GasGauge g={data.gas} /></div>}
      <ul className="space-y-2">
        {list.map((n) => (
          <li key={n.needId} className={cx("flex items-center gap-3 rounded-[16px] px-3.5 py-2.5 ring-1", n.status === "done" ? "bg-transparent opacity-60 ring-sand" : "bg-paper-2/70 ring-sand")}>
            <span className="text-lg">{CAT[n.category] ?? "📦"}</span>
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm font-semibold", n.status === "done" && "line-through")}>{n.item}</p>
              <p className="text-[11.5px] text-muted">{n.source === "voice" ? `${name} mentioned it` : "added by family"}{n.status === "claimed" ? ` · ${n.claimedBy} is arranging it` : n.status === "done" ? ` · done by ${n.claimedBy}` : n.urgency === "soon" ? " · soon" : ""}</p>
            </div>
            {n.status === "open" && <Button size="sm" variant="saffron" onClick={() => act(n.needId, "claim")}>I&apos;ll handle it</Button>}
            {n.status === "claimed" && <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => act(n.needId, "done")}>Done</Button>}
          </li>
        ))}
        {data && !list.length && <li className="text-sm text-muted">Nothing on the list. When {name} says something is running out, it appears here.</li>}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (item.trim().length < 2) return; await post(`/elders/${elderId}/needs`, { item }); setItem(""); reload(); }}>
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add something, e.g. fix the geyser" className="min-w-0 flex-1 rounded-full border border-sand-deep bg-paper px-4 py-2 text-sm outline-none focus:border-saffron" />
        <Button size="sm" variant="secondary" icon={Plus} disabled={item.trim().length < 2}>Add</Button>
      </form>
      <p className="mt-2 text-[11px] text-muted">{name} hears who&apos;s arranging what in her next call.</p>
    </Card>
  );
}

// ---------- sibling rota ----------
interface Rota { members: { name: string; relation: string; thisWeek: number; daysSince: number | null }[]; nextUp: { name: string; daysSince: number | null } | null; daysSinceAnyCall: number | null; thisWeekTotal: number }
export function RotaCard({ elderId, name }: { elderId: string; name: string }) {
  const { data } = useApi<Rota>(`/elders/${elderId}/rota`);
  if (!data) return <Skeleton className="h-48" />;
  const max = Math.max(1, ...data.members.map((m) => m.thisWeek));
  return (
    <Card>
      <CardHeader icon={Users} tone="navy" kicker="Fair share, no guilt trips" title="Who's calling Amma" />
      <ul className="space-y-3">
        {data.members.map((m) => (
          <li key={m.name}>
            <div className="flex items-baseline justify-between text-sm"><span className="font-semibold">{m.name} <span className="font-normal text-muted">· {m.relation}</span></span><span className="text-xs text-muted">{m.daysSince === null ? "no calls yet" : m.daysSince === 0 ? "called today" : `last call ${m.daysSince}d ago`}</span></div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand/60"><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--k-saffron),var(--k-rust))] transition-all duration-700" style={{ width: `${(m.thisWeek / max) * 100}%` }} /></div>
              <span className="w-14 text-right text-xs font-semibold tabular">{m.thisWeek} call{m.thisWeek === 1 ? "" : "s"}</span>
            </div>
          </li>
        ))}
      </ul>
      {data.nextUp && data.members.length > 1 && (
        <p className="mt-4 flex items-center gap-2 rounded-[14px] bg-saffron-soft px-3 py-2 text-sm"><Heart className="size-4 text-rust" /><span><b>{data.nextUp.name}</b>, it&apos;s your turn{data.nextUp.daysSince !== null ? `: ${name} last heard from you ${data.nextUp.daysSince} days ago` : ""}.</span></p>
      )}
    </Card>
  );
}

// ---------- grandchildren's voice notes ----------
export function VoiceNoteCard({ elderId, name }: { elderId: string; name: string }) {
  const { bump } = useLive();
  const [state, setState] = useState<"idle" | "recording" | "sending" | "done">("idle");
  const [who, setWho] = useState({ fromName: "Aarav", relation: "grandson" });
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => { if (state !== "recording") return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [state]);
  const start = async () => {
    setErr(null); setSaid(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("sending");
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        const audio: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
        try { const out = await post<{ message: { text: string } }>(`/elders/${elderId}/voice-note`, { audio, ...who }); setSaid(out.message.text); setState("done"); bump(); }
        catch (e) { setErr((e as Error).message); setState("idle"); }
      };
      rec.current = mr; setSecs(0); mr.start(); setState("recording");
      setTimeout(() => mr.state === "recording" && mr.stop(), 30_000);
    } catch { setErr("Microphone not available in this browser."); }
  };
  return (
    <Card tone="saffron">
      <CardHeader icon={Mic} tone="saffron" kicker="For grandchildren · up to 30 seconds" title={`A voice note for ${name}`} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <input value={who.fromName} onChange={(e) => setWho({ ...who, fromName: e.target.value })} placeholder="Your name" className="rounded-full border border-sand-deep bg-paper px-4 py-2 text-sm outline-none focus:border-saffron" />
        <input value={who.relation} onChange={(e) => setWho({ ...who, relation: e.target.value })} placeholder="e.g. grandson" className="rounded-full border border-sand-deep bg-paper px-4 py-2 text-sm outline-none focus:border-saffron" />
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => (state === "recording" ? rec.current?.stop() : start())} disabled={state === "sending"} aria-label={state === "recording" ? "Stop recording" : "Start recording"}
          className={cx("relative grid size-16 shrink-0 place-items-center rounded-full text-[#1d140a] transition", state === "recording" ? "bg-rust text-white" : "bg-saffron hover:brightness-105")}>
          {state === "recording" && <span className="animate-breathe absolute inset-0 rounded-full bg-rust/40" />}
          {state === "sending" ? <Loader2 className="size-6 animate-spin" /> : state === "recording" ? <Square className="relative size-5" /> : <Mic className="size-6" />}
        </button>
        <div className="text-sm">
          {state === "recording" ? <p className="font-semibold tabular">Recording… 0:{String(secs).padStart(2, "0")}</p> : state === "sending" ? <p>Gemini is listening…</p> : <p className="text-muted">Tap, speak, tap again. KaiseHo tells {name} in her next call who sent it, in their words.</p>}
        </div>
      </div>
      {said && <div className="mt-4"><HandNote by={`${who.fromName}, for ${name}`}>{said}</HandNote></div>}
      {err && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{err}</p>}
    </Card>
  );
}

// ---------- emergency health card ----------
export function HealthCardQR({ elderId, name }: { elderId: string; name: string }) {
  const [card, setCard] = useState<{ url: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { post<{ url: string; qr: string }>(`/elders/${elderId}/card`).then(setCard).catch(() => setCard(null)); }, [elderId]);
  return (
    <Card>
      <CardHeader icon={QrCode} tone="danger" kicker="For the fridge door or her purse" title="Emergency health card" />
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-36 shrink-0 place-items-center rounded-[16px] border border-sand bg-white p-2">
          {card ? <img src={`${API}${card.qr}`} alt={`QR code for ${name}'s emergency health card`} className="size-full" /> : <Loader2 className="size-6 animate-spin text-muted" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p>A neighbour or paramedic scans it and sees her conditions, medicines, allergies, blood group, recent readings and who to call. No login.</p>
          <div className="flex flex-wrap gap-2">
            {card && <Button size="sm" variant="secondary" href={card.url}>Open card</Button>}
            <Button size="sm" variant="ghost" icon={busy ? Loader2 : RefreshCw} onClick={async () => { setBusy(true); try { setCard(await post(`/elders/${elderId}/card`, { rotate: true })); } finally { setBusy(false); } }}>New link (old one stops)</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
