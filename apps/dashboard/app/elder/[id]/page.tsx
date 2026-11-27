"use client";
import { ArrowUpRight, Handshake, BadgeCheck, Brain, CalendarClock, ChevronDown, Clock, HeartPulse, Lock, MessageSquareText, Phone, PhoneOutgoing, Pill, Plus, Send, Sparkles, Timer, Trash2, TrendingUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DigestCard } from "@/components/DigestCard";
import { HealthCard } from "@/components/HealthCard";
import { AppointmentsCard, PrescriptionCard } from "@/components/CareCards";
import { OccasionsCard, PensionCard, ReadbackCard, RemindersCard } from "@/components/LifeCards";
import { AdherenceChart, MoodPainChart, SummaryBlock, TodayCard } from "@/components/cards";
import { Constellation, HealthCardQR, IndexRiver, InsightCards, NeedsCard, PatternList, RotaCard, STATUS_WORD, VitalsCard, VoiceNoteCard, type Wellbeing } from "@/components/Insight";
import { Avatar, Badge, Button, Card, CardHeader, CountUp, Empty, HandNote, SectionHead, Skeleton, cx } from "@/components/ui";
import { api, post, type Memory, type Message, type Profile, type TimelineCall, type TodayView, type TrendPoint } from "@/lib/api";
import { MOOD_EMOJI, cap, clock, dayLabel, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

const SECTIONS = [["wellbeing", "Wellbeing"], ["health", "Health"], ["family", "Family"], ["life", "Life admin"], ["calls", "Calls"], ["medicines", "Care settings"]] as const;
const MEM_STYLE: Record<string, string> = { person: "bg-navy-soft text-navy", event: "bg-saffron-soft text-saffron-deep", health: "bg-danger-soft text-danger", preference: "bg-forest-soft text-forest", story: "bg-sand/60 text-muted", plan: "bg-teal-soft text-teal" };

function Transcript({ elderId, callId }: { elderId: string; callId: string }) {
  const { data } = useApi<{ turns: { idx: number; role: string; text: string }[]; purgeAt: string | null; note: string }>(`/elders/${elderId}/transcript/${callId}`);
  if (!data) return <Skeleton className="h-20" />;
  if (!data.turns.length) return <p className="text-xs text-muted">Transcript already deleted (privacy: raw turns are kept for 24 h only).</p>;
  return (
    <div className="mt-3 space-y-1.5 rounded-2xl bg-cream p-3 ring-1 ring-sand">
      {data.turns.map((t) => (
        <p key={t.idx} className="text-sm"><b className={t.role === "agent" ? "text-navy" : "text-saffron-deep"}>{t.role === "agent" ? "KaiseHo" : "Amma"}:</b> {t.text}</p>
      ))}
      <p className="pt-1 text-[11px] text-muted"><Lock className="mr-1 inline size-3" />{data.note}{data.purgeAt && ` Deletes at ${new Date(data.purgeAt).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}.`}</p>
    </div>
  );
}

function CallCard({ c, elderId, open, onToggle }: { c: TimelineCall; elderId: string; open: boolean; onToggle: () => void }) {
  const q = c.qualityChecks ?? {};
  return (
    <li className="relative pl-8">
      <span className={cx("absolute top-1 left-0 grid size-6 place-items-center rounded-full text-xs ring-4 ring-paper",
        c.status === "completed" ? "bg-forest text-on-forest" : c.status === "no_answer" ? "bg-danger text-on-forest" : "bg-saffron text-ink")}>
        {c.status === "completed" ? "✓" : c.status === "no_answer" ? "!" : "•"}
      </span>
      <div className="rounded-2xl border border-sand bg-paper p-4 transition hover:shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{c.startedAt ? dayLabel(c.startedAt.slice(0, 10)) : "—"} · {clock(c.startedAt)}</p>
            <Badge>{c.reason}</Badge>
            {c.mode === "simulated" && <Badge tone="saffron">simulated</Badge>}
            {c.status !== "completed" && <Badge tone={c.status === "no_answer" ? "danger" : "saffron"}>{c.status.replace("_", " ")}</Badge>}
            {c.mood && <span className="text-lg" title={`mood ${c.mood}/5`}>{MOOD_EMOJI[c.mood]}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            {c.durationSec && <span className="inline-flex items-center gap-1"><Timer className="size-3.5" />{Math.round(c.durationSec / 6) / 10} min</span>}
            {Object.keys(q).length > 0 && <span className="inline-flex items-center gap-1 text-forest" title={Object.entries(q).map(([k, v]) => `${k}: ${v ? "pass" : "fail"}`).join("\n")}><BadgeCheck className="size-3.5" />{Object.values(q).filter(Boolean).length}/{Object.keys(q).length} quality checks</span>}
          </div>
        </div>
        {c.summary ? <div className="mt-3"><SummaryBlock summary={c.summary} /></div> : <p className="mt-2 text-sm text-muted">{c.status === "in_progress" || c.status === "ringing" ? "Call in progress…" : "No summary."}</p>}
        {c.transcriptAvailable && (
          <button onClick={onToggle} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline">
            <ChevronDown className={cx("size-3.5 transition", open && "rotate-180")} />{open ? "Hide" : "Show"} redacted transcript
          </button>
        )}
        {open && <Transcript elderId={elderId} callId={c.callId} />}
      </div>
    </li>
  );
}

function MessagesPanel({ elderId }: { elderId: string }) {
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
    <Card>
      <CardHeader icon={MessageSquareText} tone="navy" kicker="Family ↔ Amma" title="Messages" />
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="e.g. I'll visit on Sunday with the kids"
          className="min-w-0 flex-1 rounded-xl border border-sand-deep bg-paper px-4 py-2.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30" />
        <Button icon={Send} onClick={send} disabled={sending || !text.trim()}>Send</Button>
      </div>
      <p className="mt-2 text-xs text-muted">KaiseHo delivers it warmly in the next call and tells you when she heard it.</p>
      <ul className="mt-4 space-y-2">
        {(data ?? []).slice(0, 8).map((m) => (
          <li key={m.messageId} className={cx("flex", m.direction === "to_elder" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", m.direction === "to_elder" ? "rounded-br-md bg-forest text-on-forest" : "rounded-bl-md bg-saffron-soft text-ink ring-1 ring-saffron/30")}>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{m.direction === "to_elder" ? `${m.fromName} → Amma` : "Amma → family"}</p>
              <p>{m.text}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{timeAgo(m.createdAt)} · {m.direction === "to_elder" ? (m.delivered ? "✓✓ heard in a call" : "⏳ waiting for the next call") : "sent with her permission"}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MedicinesPanel({ elderId, profile, reload }: { elderId: string; profile?: Profile; reload: () => void }) {
  const [form, setForm] = useState({ name: "", dose: "", slots: ["night"] as string[] });
  const [show, setShow] = useState(false);
  const { bump } = useLive();
  const add = async () => {
    await post(`/elders/${elderId}/medications`, form);
    setForm({ name: "", dose: "", slots: ["night"] }); setShow(false); reload(); bump();
  };
  return (
    <Card>
      <CardHeader icon={Pill} tone="navy" kicker="Asked about by name in every call" title="Medicines" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setShow(!show)}>Add</Button>} />
      {show && (
        <div className="mb-4 grid gap-2 rounded-2xl bg-cream p-3 ring-1 ring-sand sm:grid-cols-[1fr_120px]">
          <input placeholder="Name, e.g. Telmisartan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border border-sand-deep bg-paper px-3 py-2 text-sm outline-none focus:border-saffron" />
          <input placeholder="Dose, e.g. 40 mg" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} className="rounded-xl border border-sand-deep bg-paper px-3 py-2 text-sm outline-none focus:border-saffron" />
          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {["morning", "afternoon", "evening", "night"].map((s) => (
              <button key={s} onClick={() => setForm({ ...form, slots: form.slots.includes(s) ? form.slots.filter((x) => x !== s) : [...form.slots, s] })}
                className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", form.slots.includes(s) ? "bg-forest text-on-forest ring-forest" : "bg-paper text-muted ring-sand-deep")}>{cap(s)}</button>
            ))}
            <Button size="sm" className="ml-auto" onClick={add} disabled={!form.name || !form.dose || !form.slots.length}>Save</Button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {(profile?.meds ?? []).map((m) => (
          <li key={m.medId} className="flex items-center justify-between gap-3 rounded-2xl bg-cream/60 px-4 py-3 ring-1 ring-sand">
            <div>
              <p className="font-semibold">{m.name} <span className="font-normal text-muted">{m.dose}</span></p>
              <p className="text-xs text-muted">{m.slots.map(cap).join(" · ")}{m.withFood ? ` · ${m.withFood} food` : ""}{typeof m.stockCount === "number" ? ` · ${m.stockCount} left` : ""} · added by {m.addedBy.replace("family:mem_", "")}</p>
            </div>
            <button onClick={async () => { await api(`/elders/${elderId}/medications/${m.medId}`, { method: "DELETE" }); reload(); }} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">KaiseHo never gives medical advice or changes doses. It asks, logs and says “please check with your doctor”.</p>
    </Card>
  );
}

export default function ElderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: today } = useApi<TodayView>(`/elders/${id}`);
  const { data: profile, reload: reloadProfile } = useApi<Profile>(`/elders/${id}/profile`);
  const { data: calls } = useApi<TimelineCall[]>(`/elders/${id}/timeline?days=14`);
  const { data: trend } = useApi<TrendPoint[]>(`/elders/${id}/trends?days=14`);
  const { data: mem } = useApi<{ memories: Memory[]; privateCount: number }>(`/elders/${id}/memories`);
  const { data: w } = useApi<Wellbeing>(`/elders/${id}/wellbeing`);
  const { bump } = useLive();
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (!today || !profile) return <div className="space-y-5"><Skeleton className="h-36" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>;
  const e = profile.elder;

  const n = e.preferredName;
  return (
    <div className="space-y-6">
      {/* ---------- portrait ---------- */}
      <section className="animate-fade-up relative overflow-hidden rounded-[28px] border border-sand bg-paper shadow-[var(--shadow-card)]">
        <div className="k-kolam pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar name={e.name} size={96} ring={e.status === "active" ? "green" : "amber"} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-saffron-deep uppercase">Daily check-in · {e.status === "pending_consent" ? "awaiting consent" : "consented"}</p>
              <h1 className="font-display text-[2.6rem] leading-none font-medium tracking-tight sm:text-[3.2rem]">{e.name} <span className="k-wonk text-saffron-deep">{n}</span></h1>
              <p className="mt-2 text-sm text-muted">{e.age} · {e.city} · {e.conditions.map(cap).join(", ")}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="forest"><CalendarClock className="size-3" />Daily at {e.callTimeLocal}</Badge>
                <Badge tone={e.status === "active" ? "forest" : "saffron"}>{e.status}{e.pausedUntil ? ` until ${e.pausedUntil}` : ""}</Badge>
                <Badge tone="navy">{e.languages.map((l) => ({ kn: "ಕನ್ನಡ", hi: "हिन्दी", en: "English" })[l] ?? l).join(" · ")}</Badge>
                <Badge><Phone className="size-3" />{e.phone}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 lg:items-end">
            {w?.highlights.at(-1) ? <HandNote by={`${n}, ${dayLabel(w.highlights.at(-1)!.date)}`} className="lg:text-right">{w.highlights.at(-1)!.text}</HandNote> : <span />}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Phone} href="tel:+910000000000">Call her yourself</Button>
              <Button icon={PhoneOutgoing} onClick={async () => { await post(`/elders/${id}/call-now`); bump(); }}>KaiseHo, call now</Button>
            </div>
          </div>
        </div>
        <nav className="relative flex gap-1 overflow-x-auto border-t border-sand px-4 py-2.5 scrollbar-thin sm:px-7">
          {SECTIONS.map(([k, l], i) => <a key={k} href={`#${k}`} className="rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted transition hover:bg-sand/60 hover:text-ink"><span className="k-wonk mr-1.5 font-display text-saffron-deep tabular">{String(i + 1).padStart(2, "0")}</span>{l}</a>)}
        </nav>
      </section>

      {e.status === "pending_consent" ? (
        <Card tone="saffron">
          <div className="flex flex-wrap items-center gap-4">
            <Handshake className="size-8 text-forest" />
            <div className="min-w-0 flex-1"><p className="font-display text-lg">Consent first: no daily calls yet</p><p className="text-sm text-muted">KaiseHo makes one welcome call. It discloses it&apos;s an AI, asks if daily calls are okay, at what time, and what can be shared. The schedule starts only on a yes.</p></div>
            <Button icon={PhoneOutgoing} onClick={async () => { await post(`/elders/${id}/welcome-call`); bump(); }}>Make the welcome call</Button>
          </div>
        </Card>
      ) : profile.consent && (
        <p className="flex flex-wrap items-center gap-2 rounded-full bg-forest-soft px-4 py-2 text-[13px] text-forest"><Handshake className="size-4" />
          <b>Consent recorded</b> {new Date(profile.consent.recordedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · daily calls {profile.consent.dailyCalls ? `yes${profile.consent.preferredTime ? ` at ${profile.consent.preferredTime}` : ""}` : "no"} · shares {[profile.consent.shareMedicines && "medicines", profile.consent.shareWellbeing && "wellbeing", profile.consent.shareMemories && "memories"].filter(Boolean).join(", ") || "safety alerts only"}
        </p>
      )}

      {/* ---------- 01 wellbeing ---------- */}
      <SectionHead id="wellbeing" n="01" title="Wellbeing" sub="from conversation, not ratings" />
      {w ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader icon={Sparkles} tone="saffron" kicker="Six dimensions · this week vs last" title="Her constellation" />
            <div className="relative mx-auto w-full max-w-[320px]">
              <Constellation w={w} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><p className="font-display text-[3rem] leading-none font-medium"><CountUp value={w.today?.index ?? 0} /></p><p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">today</p></div></div>
            </div>
            <p className="text-center text-sm text-muted"><span className="font-semibold text-ink">{STATUS_WORD[w.status]}</span>{w.baseline.n >= 5 ? ` · her usual ${w.baseline.mean} ± ${w.baseline.sd}` : ""}</p>
            {w.voice && <p className="mt-3 rounded-full bg-paper-2 px-3 py-1.5 text-center text-[12px] text-muted ring-1 ring-sand">Voice vitality · {w.voice.wpm} words/min · replies in {w.voice.replyGapSec.toFixed(1)}s</p>}
          </Card>
          <div className="space-y-5 lg:col-span-7">
            <Card>
              <CardHeader icon={TrendingUp} tone="saffron" kicker="30 days · hover any day" title="Day by day" />
              <IndexRiver w={w} />
            </Card>
            <Card>
              <CardHeader icon={Brain} tone="navy" kicker="Found in her own history" title="Patterns" />
              <PatternList w={w} />
            </Card>
          </div>
        </div>
      ) : <Skeleton className="h-80" />}
      <div id="today" className="grid scroll-mt-28 gap-5 lg:grid-cols-2">
        <TodayCard v={today} />
        <InsightCards elderId={id} />
      </div>

      {/* ---------- 02 health ---------- */}
      <SectionHead id="health" n="02" title="Health" sub="readings, refills, the doctor" action={<Button size="sm" variant="ghost" href={`/elder/${id}/brief`}>Doctor brief <ArrowUpRight className="size-3.5" /></Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <VitalsCard elderId={id} />
        <HealthCard elderId={id} />
        <AppointmentsCard elderId={id} name={n} />
        <HealthCardQR elderId={id} name={n} />
      </div>
      <section id="trends" className="grid scroll-mt-28 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Pill} tone="navy" kicker="Doses per day" title="Medicine adherence" />
          {trend && <AdherenceChart data={trend} />}
          <p className="mt-2 text-xs text-muted">Green = taken · red = missed. Critical medicines get one short follow-up call when a dose isn&apos;t taken yet.</p>
        </Card>
        <PrescriptionCard elderId={id} onSaved={reloadProfile} />
      </section>

      {/* ---------- 03 family ---------- */}
      <SectionHead id="family" n="03" title="Family" sub="needs, calls, messages" />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><NeedsCard elderId={id} name={n} /></div>
        <div className="space-y-5 lg:col-span-5"><RotaCard elderId={id} name={n} /><VoiceNoteCard elderId={id} name={n} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section id="messages" className="scroll-mt-28"><MessagesPanel elderId={id} /></section>
        <ReadbackCard elderId={id} name={n} />
      </div>

      {/* ---------- 04 life ---------- */}
      <SectionHead id="life" n="04" title="Life admin" sub="reminders, occasions, pension" />
      <div className="grid gap-5 lg:grid-cols-3">
        <RemindersCard elderId={id} name={n} />
        <OccasionsCard elderId={id} name={n} />
        <PensionCard elderId={id} name={n} />
      </div>

      {/* ---------- 05 calls ---------- */}
      <SectionHead id="calls" n="05" title="Every call" sub="summaries, quality checks, redacted transcripts" />
      <div className="grid gap-5 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <Card>
            <CardHeader icon={HeartPulse} kicker="Summarised for you" title="Check-in timeline" />
            {!calls?.length ? <Empty icon={Phone} title="No calls yet" /> : (
              <ol className="relative space-y-3 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-sand">
                {calls.slice(0, showAll ? 14 : 4).map((c) => <CallCard key={c.callId} c={c} elderId={id} open={openCall === c.callId} onToggle={() => setOpenCall(openCall === c.callId ? null : c.callId)} />)}
              </ol>
            )}
            {(calls?.length ?? 0) > 4 && <Button className="mt-4" variant="secondary" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${Math.min(14, calls!.length)} calls`}</Button>}
          </Card>
        </section>
        <div className="space-y-5 lg:col-span-2">
          <section id="memories" className="scroll-mt-28">
            <Card>
              <CardHeader icon={Brain} kicker="What KaiseHo remembers" title="Memories & follow-ups" />
              <ul className="space-y-2">
                {(mem?.memories ?? []).slice(0, 9).map((m) => (
                  <li key={m.memoryId} className="flex items-start gap-2.5 text-sm">
                    <span className={cx("mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", MEM_STYLE[m.type])}>{m.type}</span>
                    <span className="flex-1">{m.text}{m.followUpAfter && !m.followUpDone && <span className="ml-1 text-xs text-saffron-deep">· will ask</span>}{m.followUpDone && <span className="ml-1 text-xs text-forest">· asked ✓</span>}</span>
                  </li>
                ))}
              </ul>
              {(mem?.privateCount ?? 0) > 0 && (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-xs text-muted ring-1 ring-sand"><Lock className="size-3.5" />{mem!.privateCount} private item{mem!.privateCount > 1 ? "s" : ""}: {n} asked to keep {mem!.privateCount > 1 ? "them" : "it"} private.</p>
              )}
            </Card>
          </section>
          <Card>
            <CardHeader icon={TrendingUp} kicker="14 days" title="Mood & pain" />
            <MoodPainChart data={today.trend} height={200} />
          </Card>
        </div>
      </div>

      {/* ---------- 06 care settings ---------- */}
      <SectionHead id="medicines" n="06" title="Care settings" sub="medicines, digest, schedule" />
      <div className="grid gap-5 lg:grid-cols-2">
        <MedicinesPanel elderId={id} profile={profile} reload={reloadProfile} />
        <DigestCard elderId={id} name={n} />
      </div>
      <section id="schedule" className="scroll-mt-28">
        <Card>
          <CardHeader icon={Clock} kicker={`${n} can change this by voice too`} title="Call schedule" />
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted">Daily call time</span>
              <input type="time" defaultValue={e.callTimeLocal} onChange={(ev) => setTime(ev.target.value)} className="rounded-full border border-sand-deep bg-paper px-4 py-2 outline-none focus:border-saffron" />
            </label>
            <Button variant="secondary" disabled={!time} onClick={async () => { await api(`/elders/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ callTimeLocal: time }) }); reloadProfile(); }}>Save time</Button>
            <Button variant="ghost" onClick={async () => { await api(`/elders/${id}/schedule`, { method: "PATCH", body: JSON.stringify(e.status === "active" ? { status: "paused" } : { status: "active", pausedUntil: undefined }) }); reloadProfile(); }}>
              {e.status === "active" ? "Pause calls" : "Resume calls"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">Reminder and callback calls are under <a href="#life" className="underline">Life admin</a>.</p>
        </Card>
      </section>
    </div>
  );
}
