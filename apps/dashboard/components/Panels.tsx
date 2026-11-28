"use client";
import {
  BadgeCheck, Brain, CheckCheck, ChevronDown, Clock, Lock, MessageSquareText, Mic2, Pause, Phone, Pill, Play, Plus, Send, ShoppingBasket, Sparkles, Timer, Trash2, Users,
} from "lucide-react";
import { useState } from "react";
import { api, post, type Message, type Profile, type TimelineCall } from "@/lib/api";
import { MOOD_EMOJI, cap, clock, dayLabel, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";
import { SummaryBlock } from "./cards";
import { Badge, Button, Card, CardHeader, Empty, Skeleton, cx } from "./ui";

// ---------------------------------------------------------------- calls

function Transcript({ elderId, callId, name }: { elderId: string; callId: string; name: string }) {
  const { data } = useApi<{ turns: { idx: number; role: string; text: string }[]; purgeAt: string | null; note: string }>(`/elders/${elderId}/transcript/${callId}`);
  if (!data) return <Skeleton className="mt-3 h-20" />;
  if (!data.turns.length) return <p className="mt-3 text-xs text-muted">Transcript already deleted (privacy: raw turns are kept for 24 h only).</p>;
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-cream/60 p-3.5 ring-1 ring-sand">
      {data.turns.map((t) => (
        <div key={t.idx} className={cx("flex", t.role === "agent" ? "justify-start" : "justify-end")}>
          <p className={cx("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug", t.role === "agent" ? "rounded-bl-md bg-violet/15 text-ink" : "rounded-br-md bg-saffron-soft text-ink")}>
            <span className="k-label mb-0.5 block text-[8.5px] text-muted">{t.role === "agent" ? "KaiseHo" : name}</span>{t.text}
          </p>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-muted"><Lock className="mr-1 inline size-3" />{data.note}{data.purgeAt && ` Deletes ${new Date(data.purgeAt).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}.`}</p>
    </div>
  );
}

function CallRow({ c, elderId, name, open, onToggle }: { c: TimelineCall; elderId: string; name: string; open: boolean; onToggle: () => void }) {
  const q = c.qualityChecks ?? {};
  const done = c.status === "completed";
  return (
    <li className="relative pl-9">
      <span className={cx("absolute top-4 left-0 grid size-6 place-items-center rounded-full text-[11px] font-bold ring-4 ring-cream",
        done ? "bg-forest text-on-forest" : c.status === "no_answer" ? "bg-danger text-white" : "bg-saffron text-on-saffron")}>
        {done ? "✓" : c.status === "no_answer" ? "!" : "•"}
      </span>
      <div className="rounded-2xl border border-sand bg-ink/[0.025] p-4 transition hover:border-sand-deep">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-semibold">{c.startedAt ? dayLabel(c.startedAt.slice(0, 10)) : "—"} <span className="font-normal text-muted">· {clock(c.startedAt)}</span></p>
            <Badge>{c.reason}</Badge>
            {c.mode === "simulated" && <Badge tone="saffron">simulated</Badge>}
            {!done && <Badge tone={c.status === "no_answer" ? "danger" : "saffron"}>{c.status.replace("_", " ")}</Badge>}
            {c.mood && <span className="text-lg" title={`mood ${c.mood}/5`}>{MOOD_EMOJI[c.mood]}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            {c.durationSec && <span className="inline-flex items-center gap-1"><Timer className="size-3.5" />{Math.round(c.durationSec / 6) / 10} min</span>}
            {Object.keys(q).length > 0 && <span className="inline-flex items-center gap-1 text-forest" title={Object.entries(q).map(([k, v]) => `${k}: ${v ? "pass" : "fail"}`).join("\n")}><BadgeCheck className="size-3.5" />{Object.values(q).filter(Boolean).length}/{Object.keys(q).length} checks</span>}
          </div>
        </div>
        {c.summary ? <div className="mt-3"><SummaryBlock summary={c.summary} /></div> : <p className="mt-2 text-sm text-muted">{c.status === "in_progress" || c.status === "ringing" ? "Call in progress…" : "No summary."}</p>}
        {c.transcriptAvailable && (
          <button onClick={onToggle} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-saffron hover:underline">
            <ChevronDown className={cx("size-3.5 transition", open && "rotate-180")} />{open ? "Hide" : "Show"} redacted transcript
          </button>
        )}
        {open && <Transcript elderId={elderId} callId={c.callId} name={name} />}
      </div>
    </li>
  );
}

export function CallTimeline({ elderId, name }: { elderId: string; name: string }) {
  const { data: calls } = useApi<TimelineCall[]>(`/elders/${elderId}/timeline?days=14`);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  return (
    <Card>
      <CardHeader icon={Phone} tone="saffron" kicker="Summarised for you · last 14 days" title="Every check-in" />
      {!calls ? <Skeleton className="h-60" /> : !calls.length ? <Empty icon={Phone} title="No calls yet" /> : (
        <ol className="relative space-y-3 before:absolute before:top-5 before:bottom-5 before:left-3 before:w-px before:bg-sand-deep">
          {calls.slice(0, all ? 14 : 5).map((c) => <CallRow key={c.callId} c={c} elderId={elderId} name={name} open={openCall === c.callId} onToggle={() => setOpenCall(openCall === c.callId ? null : c.callId)} />)}
        </ol>
      )}
      {(calls?.length ?? 0) > 5 && <Button className="mt-4" variant="secondary" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${Math.min(14, calls!.length)} calls`}</Button>}
    </Card>
  );
}

/** Her choice: a clear assistant or a warm companion (no voice cloning, ever). */
export function CallStyleCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ elder: { voiceStyle?: "clear" | "warm" } }>(`/elders/${elderId}/profile`);
  const cur = data?.elder.voiceStyle ?? "warm";
  const { bump } = useLive();
  const set = async (s: "clear" | "warm") => { await api(`/elders/${elderId}/voice-style`, { method: "PATCH", body: JSON.stringify({ voiceStyle: s }) }); reload(); bump(); };
  const opts = [
    { k: "clear" as const, title: "Clear assistant", sub: "Short and to the point. Medicines, anything worrying, done in ~2 minutes.", line: "“Namaste. Did you take your Metformin today?”", icon: Mic2 },
    { k: "warm" as const, title: "Warm companion", sub: "Chatty and curious about her day, her plants, her friends. ~3–5 minutes.", line: "“Namaste Amma! Did the jasmine flower today?”", icon: Sparkles },
  ];
  return (
    <Card>
      <CardHeader icon={Mic2} tone="navy" kicker={`${name} can change this by voice anytime`} title="How KaiseHo talks to her" />
      <div className="grid gap-3 sm:grid-cols-2">
        {opts.map((o) => (
          <button key={o.k} onClick={() => set(o.k)} className={cx("group relative rounded-2xl p-4 text-left ring-1 transition", cur === o.k ? "bg-saffron-soft ring-saffron/60" : "bg-ink/[0.03] ring-sand hover:ring-sand-deep")}>
            <div className="flex items-center justify-between">
              <o.icon className={cx("size-5", cur === o.k ? "text-saffron" : "text-muted")} />
              <span className={cx("grid size-5 place-items-center rounded-full ring-1", cur === o.k ? "bg-saffron text-on-saffron ring-saffron" : "ring-sand-deep")}>{cur === o.k && <CheckCheck className="size-3" />}</span>
            </div>
            <p className="mt-3 font-display text-[1.05rem] font-semibold">{o.title}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">{o.sub}</p>
            <p className="mt-3 font-serif text-[15px] italic opacity-90">{o.line}</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-muted">Never a cloned family voice: KaiseHo always says it&apos;s an AI helper. If {name} says “keep it short” in a call, it switches by itself.</p>
    </Card>
  );
}

export function ScheduleCard({ elderId, name }: { elderId: string; name: string }) {
  const { data: profile, reload } = useApi<Profile>(`/elders/${elderId}/profile`);
  const [time, setTime] = useState<string | null>(null);
  const { bump } = useLive();
  if (!profile) return <Skeleton className="h-56" />;
  const e = profile.elder;
  const patch = async (b: object) => { await api(`/elders/${elderId}/schedule`, { method: "PATCH", body: JSON.stringify(b) }); reload(); bump(); };
  const away = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days + 1); return patch({ status: "paused", pausedUntil: d.toISOString().slice(0, 10) }); };
  return (
    <Card>
      <CardHeader icon={Clock} tone="teal" kicker={`${name} can change this by voice too`} title="Schedule & away mode" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="k-label mb-1.5 block text-muted">Daily call time</span>
          <input type="time" defaultValue={e.callTimeLocal} onChange={(ev) => setTime(ev.target.value)} className="h-10 rounded-full border border-sand-deep bg-ink/[0.03] px-4 outline-none focus:border-saffron" />
        </label>
        <Button variant="secondary" disabled={!time || time === e.callTimeLocal} onClick={() => patch({ callTimeLocal: time })}>Save time</Button>
        <Badge tone={e.status === "active" ? "forest" : "saffron"} className="mb-2.5">{e.status === "active" ? "● calls on" : `paused${e.pausedUntil ? ` until ${e.pausedUntil}` : ""}`}</Badge>
      </div>
      <p className="k-label mt-5 mb-2 text-muted">She&apos;s travelling or staying with you?</p>
      <div className="flex flex-wrap gap-2">
        {[[1, "Skip tomorrow"], [3, "3 days"], [7, "A week"]].map(([d, l]) => <Button key={d} size="sm" variant="secondary" icon={Pause} onClick={() => away(d as number)}>{l}</Button>)}
        {e.status !== "active" && <Button size="sm" icon={Play} onClick={() => patch({ status: "active", pausedUntil: undefined })}>Resume calls</Button>}
      </div>
      <p className="mt-3 text-[11.5px] text-muted">Scam and emergency protection don&apos;t depend on calls and stay on. Also from Telegram: <code className="rounded bg-ink/[0.06] px-1">/away</code>.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- family

export function MessagesPanel({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<Message[]>(`/elders/${elderId}/messages`);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { bump } = useLive();
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await post(`/elders/${elderId}/messages`, { text, fromName: "Ravi" });
    setText(""); setSending(false); reload(); bump();
  };
  return (
    <Card className="h-full">
      <CardHeader icon={MessageSquareText} tone="navy" kicker={`Family ↔ ${name} · also from Telegram`} title="Messages" />
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="e.g. I'll visit on Sunday with the kids"
          className="h-11 min-w-0 flex-1 rounded-full border border-sand-deep bg-ink/[0.03] px-4 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/25" />
        <Button icon={Send} onClick={send} disabled={sending || !text.trim()}>Send</Button>
      </div>
      <p className="mt-2 text-xs text-muted">KaiseHo says it warmly in the next call and tells you when she heard it.</p>
      <ul className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {(data ?? []).slice(0, 12).map((m) => (
          <li key={m.messageId} className={cx("flex", m.direction === "to_elder" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", m.direction === "to_elder" ? "rounded-br-md bg-[linear-gradient(135deg,color-mix(in_oklab,var(--k-violet)_30%,transparent),color-mix(in_oklab,var(--k-violet)_14%,transparent))] ring-1 ring-violet/25" : "rounded-bl-md bg-saffron-soft ring-1 ring-saffron/25")}>
              <p className="k-label text-[8.5px] text-muted">{m.direction === "to_elder" ? `${m.fromName} → ${name}${m.kind === "voice" ? " · voice note" : ""}` : `${name} → family`}</p>
              <p className="mt-0.5">{m.text}</p>
              <p className="mt-0.5 text-[10.5px] text-muted">{timeAgo(m.createdAt)} · {m.direction === "to_elder" ? (m.delivered ? "✓✓ heard in a call" : "⏳ waiting for the next call") : "sent with her permission"}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface Need { needId: string; item: string; category: string; status: "open" | "claimed" | "done"; claimedBy?: string; urgency: string; source: string; updatedAt: string }
const CAT: Record<string, string> = { groceries: "🧺", medicine: "💊", gas: "🔥", household: "🧴", repair: "🔧", other: "📦" };

/** Shared household list as a board: open → someone's on it → done. */
export function NeedsBoard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ needs: Need[]; gas: { daysSince: number; intervalDays: number; daysLeft: number } | null }>(`/elders/${elderId}/needs`);
  const { bump } = useLive();
  const [item, setItem] = useState("");
  const act = async (id: string, a: "claim" | "done") => { await post(`/elders/${elderId}/needs/${id}/${a}`); reload(); bump(); };
  const needs = data?.needs ?? [];
  const cols = [
    { k: "open", title: "Needs someone", tone: "bg-saffron", items: needs.filter((n) => n.status === "open") },
    { k: "claimed", title: "Someone's on it", tone: "bg-violet", items: needs.filter((n) => n.status === "claimed") },
    { k: "done", title: "Done", tone: "bg-forest", items: needs.filter((n) => n.status === "done").slice(0, 5) },
  ] as const;
  return (
    <Card>
      <CardHeader icon={ShoppingBasket} tone="saffron" kicker={`From ${name}'s calls · every sibling sees the same list`} title="The household list"
        action={data?.gas ? <Badge tone={data.gas.daysLeft <= 5 ? "danger" : "neutral"}>🔥 Gas: {data.gas.daysLeft > 0 ? `~${data.gas.daysLeft} days left` : "due now"}</Badge> : undefined} />
      <div className="grid gap-3 md:grid-cols-3">
        {cols.map((c) => (
          <div key={c.k} className="rounded-2xl bg-ink/[0.025] p-3 ring-1 ring-sand">
            <p className="k-label mb-2.5 flex items-center gap-2 text-muted"><span className={cx("size-1.5 rounded-full", c.tone)} />{c.title}<span className="ml-auto tabular">{c.items.length}</span></p>
            <ul className="stagger space-y-2">
              {c.items.map((n) => (
                <li key={n.needId} className={cx("k-glass rounded-xl border p-3", c.k === "done" && "opacity-60")}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg leading-none">{CAT[n.category] ?? "📦"}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-[13.5px] leading-snug font-semibold", c.k === "done" && "line-through")}>{n.item}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{n.source === "voice" ? `${name} said it` : "added by family"}{n.claimedBy ? ` · ${n.claimedBy}` : ""}{n.urgency === "soon" && n.status === "open" ? " · soon" : ""}</p>
                    </div>
                  </div>
                  {n.status === "open" && <Button size="sm" className="mt-2.5 w-full" onClick={() => act(n.needId, "claim")}>🙋 I&apos;ll handle it</Button>}
                  {n.status === "claimed" && <Button size="sm" variant="secondary" icon={CheckCheck} className="mt-2.5 w-full" onClick={() => act(n.needId, "done")}>Mark done</Button>}
                </li>
              ))}
              {!c.items.length && <li className="rounded-xl border border-dashed border-sand-deep px-3 py-5 text-center text-[12px] text-muted">{c.k === "open" ? "Nothing waiting" : c.k === "claimed" ? "No one yet" : "—"}</li>}
            </ul>
          </div>
        ))}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (item.trim().length < 2) return; await post(`/elders/${elderId}/needs`, { item }); setItem(""); reload(); }}>
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add something yourself, e.g. fix the geyser" className="h-10 min-w-0 flex-1 rounded-full border border-sand-deep bg-ink/[0.03] px-4 text-sm outline-none focus:border-saffron" />
        <Button size="md" variant="secondary" icon={Plus} disabled={item.trim().length < 2}>Add</Button>
      </form>
      <p className="mt-2 text-[11.5px] text-muted">{name} hears who&apos;s arranging what in her next call. On Telegram, one tap on “I&apos;ll get it” updates every sibling&apos;s message.</p>
    </Card>
  );
}

export function MembersCard({ name }: { name: string }) {
  const { data } = useApi<{ members: { memberId: string; name: string; relation: string; role: string; telegramLinked: boolean; linkCode?: string }[] }>("/family/overview");
  return (
    <Card>
      <CardHeader icon={Users} tone="teal" kicker="Who gets what" title="The family circle" />
      <ul className="space-y-2">
        {(data?.members ?? []).map((m) => (
          <li key={m.memberId} className="flex items-center gap-3 rounded-xl bg-ink/[0.03] px-3 py-2.5 ring-1 ring-sand">
            <span className="grid size-9 place-items-center rounded-full bg-violet/20 font-display font-semibold text-violet">{m.name[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{m.name} <span className="font-normal text-muted">· {m.relation}</span></p>
              <p className="text-[11.5px] text-muted">{m.role === "primary" ? "Every alert, daily card" : m.role === "secondary" ? "Scams, needs, stories" : "Emergencies only"}</p>
            </div>
            {m.telegramLinked ? <Badge tone="forest">Telegram ✓</Badge> : m.linkCode ? <code className="rounded-md bg-ink/[0.06] px-2 py-1 text-[11px]">/start {m.linkCode}</code> : <Badge>SMS</Badge>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-muted">Open the KaiseHo bot on Telegram and send the code to link. Then try <code className="rounded bg-ink/[0.06] px-1">/today</code>, <code className="rounded bg-ink/[0.06] px-1">/tell</code> or <code className="rounded bg-ink/[0.06] px-1">/story</code>. Emergencies reach everyone, including the neighbour, about {name}.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- health

export function MedicinesPanel({ elderId }: { elderId: string }) {
  const { data: profile, reload } = useApi<Profile>(`/elders/${elderId}/profile`);
  const [form, setForm] = useState({ name: "", dose: "", slots: ["night"] as string[] });
  const [show, setShow] = useState(false);
  const { bump } = useLive();
  const add = async () => {
    await post(`/elders/${elderId}/medications`, form);
    setForm({ name: "", dose: "", slots: ["night"] }); setShow(false); reload(); bump();
  };
  return (
    <Card className="h-full">
      <CardHeader icon={Pill} tone="navy" kicker="Asked about by name in every call" title="Medicines" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setShow(!show)}>Add</Button>} />
      {show && (
        <div className="animate-slide-in mb-4 grid gap-2 rounded-2xl bg-ink/[0.03] p-3 ring-1 ring-sand sm:grid-cols-[1fr_120px]">
          <input placeholder="Name, e.g. Telmisartan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 rounded-xl border border-sand-deep bg-transparent px-3 text-sm outline-none focus:border-saffron" />
          <input placeholder="Dose, e.g. 40 mg" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} className="h-10 rounded-xl border border-sand-deep bg-transparent px-3 text-sm outline-none focus:border-saffron" />
          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {["morning", "afternoon", "evening", "night"].map((s) => (
              <button key={s} onClick={() => setForm({ ...form, slots: form.slots.includes(s) ? form.slots.filter((x) => x !== s) : [...form.slots, s] })}
                className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", form.slots.includes(s) ? "bg-saffron text-on-saffron ring-saffron" : "text-muted ring-sand-deep")}>{cap(s)}</button>
            ))}
            <Button size="sm" className="ml-auto" onClick={add} disabled={!form.name || !form.dose || !form.slots.length}>Save</Button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {(profile?.meds ?? []).map((m) => (
          <li key={m.medId} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.03] px-4 py-3 ring-1 ring-sand">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-violet/15 text-violet"><Pill className="size-4" /></span>
              <div>
                <p className="font-semibold">{m.name} <span className="font-normal text-muted">{m.dose}</span></p>
                <p className="text-xs text-muted">{m.slots.map(cap).join(" · ")}{m.withFood ? ` · ${m.withFood} food` : ""}{typeof m.stockCount === "number" ? ` · ${m.stockCount} left` : ""}</p>
              </div>
            </div>
            <button onClick={async () => { await api(`/elders/${elderId}/medications/${m.medId}`, { method: "DELETE" }); reload(); }} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">KaiseHo never gives medical advice or changes doses. It asks, logs and says “please check with your doctor”.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- mind gym

interface Mind {
  played: number; overall: number | null; headline: string; note: string;
  kinds: { game: string; label: string; played: number; recentAvg: number | null; usualAvg: number | null; trend: "steady" | "improving" | "dipping" | "new"; points: { date: string; pct: number; score: number; max: number; detail?: string }[] }[];
}
const TREND: Record<string, { word: string; tone: "forest" | "saffron" | "danger" | "neutral" }> = { steady: { word: "steady", tone: "forest" }, improving: { word: "sharper", tone: "forest" }, dipping: { word: "a small dip", tone: "danger" }, new: { word: "learning", tone: "neutral" } };

export function MindGymCard({ elderId, name, compact }: { elderId: string; name: string; compact?: boolean }) {
  const { data } = useApi<Mind>(`/elders/${elderId}/mind`);
  if (!data) return <Skeleton className="h-64" />;
  return (
    <Card className="h-full">
      <CardHeader icon={Brain} tone="rose" kicker="Playful games in calls · every third day" title="Mind gym" action={data.overall !== null ? <span className="font-display text-2xl font-semibold tabular">{data.overall}<span className="text-sm text-muted">%</span></span> : undefined} />
      <p className="text-[14px]">{data.headline}</p>
      <div className={cx("mt-4 grid gap-3", !compact && "md:grid-cols-2")}>
        {data.kinds.filter((k) => k.played || !compact).map((k) => (
          <div key={k.game} className="rounded-2xl bg-ink/[0.03] p-3.5 ring-1 ring-sand">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">{k.label}</p>
              <Badge tone={TREND[k.trend].tone}>{TREND[k.trend].word}</Badge>
            </div>
            <div className="mt-3 flex h-16 items-end gap-1">
              {k.points.slice(-12).map((p, i) => (
                <div key={i} className="group relative flex-1">
                  <div className="rounded-t-md bg-[linear-gradient(180deg,var(--k-rose),color-mix(in_oklab,var(--k-violet)_70%,transparent))] transition-all duration-700" style={{ height: `${Math.max(8, p.pct * 0.64)}px`, opacity: 0.45 + (i / 12) * 0.55 }} />
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-cream group-hover:block">{p.score}/{p.max}{p.detail ? ` ${p.detail}` : ""}</span>
                </div>
              ))}
              {!k.points.length && <p className="text-[12px] text-muted">No games yet.</p>}
            </div>
            <p className="mt-2 text-[11.5px] text-muted">{k.recentAvg !== null ? `Lately ${k.recentAvg}%` : ""}{k.usualAvg !== null ? ` · her usual ${k.usualAvg}%` : ""}</p>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-4 rounded-2xl bg-[linear-gradient(120deg,var(--k-rose-soft),transparent)] p-4 ring-1 ring-rose/20">
          <p className="k-label text-rose">How it sounds in a call</p>
          <p className="mt-1.5 font-serif text-[16px] italic">“Chaliye ek chhota sa khel! Teen shabd yaad rakhiye: aam, kursi, neela…”</p>
          <p className="mt-1 text-[12px] text-muted">…and just before goodbye: “Ab batayiye, woh teen shabd kaun se the?” Cheered whatever {name} remembers.</p>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">{data.note}</p>
    </Card>
  );
}

