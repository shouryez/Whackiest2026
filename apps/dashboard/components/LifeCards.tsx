"use client";
import { AlarmClock, BellRing, Cake, Check, Ear, HandHelping, IdCard, Loader2, Lock, PartyPopper, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api, post } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader, cx } from "./ui";

const input = "min-w-0 rounded-xl border border-sand-deep bg-paper px-3 py-2 text-sm outline-none focus:border-saffron";

function localIso(daysAhead: number, hm: string) {
  const d = new Date(Date.now() + daysAhead * 86400_000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  return `${ymd}T${hm}`;
}

// ---------------- reminders & callbacks (P2-11) ----------------
interface Reminder { reminderId: string; kind: "reminder" | "callback"; text: string; whenSpoken: string; createdBy?: string }

export function RemindersCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ reminders: Reminder[] }>(`/elders/${elderId}/reminders`);
  const { bump } = useLive();
  const [text, setText] = useState("");
  const [when, setWhen] = useState(localIso(1, "18:00"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = data?.reminders ?? [];
  return (
    <Card>
      <CardHeader icon={AlarmClock} tone="saffron" kicker="A short call at that time" title="Reminders & callbacks" />
      <ul className="space-y-2">
        {list.length === 0 && <li className="rounded-2xl bg-cream/70 px-4 py-3 text-sm text-muted ring-1 ring-sand">Nothing waiting. {name} can say “remind me at 6 to call the plumber” in any call.</li>}
        {list.map((r) => (
          <li key={r.reminderId} className="flex items-center justify-between gap-3 rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-sand">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.kind === "callback" ? "📞 Call her back" : `⏰ ${r.text}`}</p>
              <p className="text-xs text-muted">{r.whenSpoken} · {r.createdBy?.startsWith("family") ? "set by family" : `${name} asked`}</p>
            </div>
            <Button size="sm" variant="ghost" icon={X} aria-label="Cancel reminder" onClick={async () => { await post(`/elders/${elderId}/reminders/${r.reminderId}/cancel`); reload(); bump(); }}>Cancel</Button>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={async (ev) => {
        ev.preventDefault(); setBusy(true); setError(null);
        try { await post(`/elders/${elderId}/reminders`, { text, whenLocalIso: when }); setText(""); reload(); bump(); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. check your BP" className={cx(input, "flex-1 basis-40")} />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />
        <Button icon={busy ? Loader2 : Plus} disabled={busy || text.trim().length < 2}>Add</Button>
      </form>
      {error && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      <p className="mt-2 text-xs text-muted">Up to 5 waiting, 30 days ahead. A reminder call is about 30 seconds.</p>
    </Card>
  );
}

// ---------------- occasions (P2-10) ----------------
interface Upcoming { id: string; title: string; kind: string; date: string; daysAway: number; person?: string; relation?: string; isElders?: boolean; wishedThisYear?: boolean; source: "family" | "festival" }
interface Saved { occasionId: string; title: string; date: string; kind: string }

export function OccasionsCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ upcoming: Upcoming[]; saved: Saved[] }>(`/elders/${elderId}/occasions?days=60`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ person: "", relation: "grandson", kind: "birthday", date: "", isElders: false });
  const [error, setError] = useState<string | null>(null);
  const day = (o: Upcoming) => (o.daysAway === 0 ? "today" : o.daysAway === 1 ? "tomorrow" : `in ${o.daysAway} days`);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
  return (
    <Card>
      <CardHeader icon={Cake} tone="navy" kicker="Greetings and wishes she sends" title="Occasions"
        action={<Button size="sm" variant="secondary" icon={open ? X : Plus} onClick={() => setOpen(!open)}>{open ? "Close" : "Add"}</Button>} />
      {open && (
        <form className="mb-4 grid gap-2 rounded-2xl bg-cream/70 p-3 ring-1 ring-sand sm:grid-cols-2" onSubmit={async (ev) => {
          ev.preventDefault(); setError(null);
          const mmdd = f.date.slice(5);
          const title = f.isElders ? `${name}'s ${f.kind}` : `${f.person}'s ${f.kind}`;
          try {
            await post(`/elders/${elderId}/occasions`, { title, kind: f.kind, date: mmdd, ...(f.isElders ? { isElders: true } : { person: f.person, relation: f.relation || undefined }) });
            setOpen(false); setF({ ...f, person: "", date: "" }); reload();
          } catch (e) { setError((e as Error).message); }
        }}>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.isElders} onChange={(e) => setF({ ...f, isElders: e.target.checked })} /> It's {name}'s own</label>
          {!f.isElders && <input value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} placeholder="Name, e.g. Aarav" className={input} />}
          {!f.isElders && <input value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder={`Relation to ${name}`} className={input} />}
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input}><option value="birthday">Birthday</option><option value="anniversary">Anniversary</option></select>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={input} />
          <Button className="sm:col-span-2" icon={Check} disabled={!f.date || (!f.isElders && f.person.trim().length < 2)}>Save (repeats every year)</Button>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
        </form>
      )}
      <ul className="space-y-2">
        {(data?.upcoming ?? []).slice(0, 6).map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-sand">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-xl">{o.source === "festival" ? "🪔" : o.kind === "anniversary" ? "💐" : "🎂"}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{o.title}{o.relation ? <span className="font-normal text-muted"> · {name}'s {o.relation}</span> : null}</p>
                <p className="text-xs text-muted">{fmt(o.date)} · {o.source === "festival" ? "KaiseHo greets her" : o.isElders ? "KaiseHo wishes her first; you get a nudge the day before" : "KaiseHo offers to send her wish"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {o.wishedThisYear ? <Badge tone="forest"><Check className="size-3" />wish sent</Badge> : <Badge tone={o.daysAway <= 2 ? "saffron" : "neutral"}>{day(o)}</Badge>}
              {o.source === "family" && (
                <button aria-label="Remove occasion" className="rounded-lg p-1 text-muted hover:bg-sand/60 hover:text-danger" onClick={async () => { await api(`/elders/${elderId}/occasions/${o.id}`, { method: "DELETE" }); reload(); }}><Trash2 className="size-4" /></button>
              )}
            </div>
          </li>
        ))}
        {data && data.upcoming.length === 0 && <li className="text-sm text-muted">Nothing in the next 60 days.</li>}
      </ul>
      <p className="mt-3 text-xs text-muted"><PartyPopper className="mr-1 inline size-3.5" />Festivals come from a team-maintained calendar, matched to her region.</p>
    </Card>
  );
}

// ---------------- pension life certificate (P2-9) ----------------
interface Pension { applicable: boolean; status: "pending" | "done" | "not_yet" | "needs_help"; method?: string; disbursedBy?: string; window: { year: number; start: string; end: string; open: boolean; daysLeft: number; superSenior: boolean }; checklist: string[] }
const PSTATUS = { pending: ["Not asked yet", "neutral"], not_yet: ["Not done yet", "saffron"], needs_help: ["Needs your help", "danger"], done: ["Submitted", "forest"] } as const;

export function PensionCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<Pension>(`/elders/${elderId}/pension`);
  const { bump } = useLive();
  if (!data) return null;
  const [label, tone] = PSTATUS[data.status];
  const mark = async (status: string) => { await post(`/elders/${elderId}/pension/life-cert`, { status }); reload(); bump(); };
  if (!data.applicable) {
    return (
      <Card>
        <CardHeader icon={IdCard} tone="forest" kicker="Every November" title="Pension life certificate" />
        <p className="text-sm text-muted">Is {name} a pensioner? KaiseHo can remind her about the yearly life certificate (Jeevan Pramaan).</p>
        <Button className="mt-3" variant="secondary" onClick={async () => { await api(`/elders/${elderId}/pension`, { method: "PUT", body: JSON.stringify({ pensioner: true }) }); reload(); }}>Yes, {name} gets a pension</Button>
      </Card>
    );
  }
  const total = data.window.superSenior ? 61 : 30;
  const pct = data.window.open ? Math.round(((total - data.window.daysLeft) / total) * 100) : data.status === "done" ? 100 : 0;
  return (
    <Card>
      <CardHeader icon={IdCard} tone="forest" kicker={`Jeevan Pramaan · ${data.window.year}`} title="Pension life certificate" action={<Badge tone={tone}>{data.status === "done" && <Check className="size-3" />}{label}</Badge>} />
      {data.status !== "done" && (
        <div className="mb-3 rounded-2xl bg-cream/70 p-3 ring-1 ring-sand">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{data.window.open ? (data.window.daysLeft === 0 ? "Last day today" : `${data.window.daysLeft} day${data.window.daysLeft === 1 ? "" : "s"} left`) : `Opens ${new Date(data.window.start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}</span>
            <span className="text-xs text-muted">due 30 Nov{data.disbursedBy ? ` · ${data.disbursedBy}` : ""}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-sand"><div className={cx("h-2 rounded-full", data.window.daysLeft <= 5 ? "bg-danger" : "bg-saffron")} style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {data.status === "done" ? (
        <p className="rounded-xl bg-forest-soft px-3 py-2 text-sm text-forest">✓ Done for {data.window.year}{data.method ? ` (${data.method})` : ""}. Nothing to do until next November.</p>
      ) : (
        <>
          <ul className="space-y-1.5 text-xs text-muted">{data.checklist.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-forest" />{c}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={Check} onClick={() => mark("done")}>Mark submitted</Button>
            {data.status !== "needs_help" && <Button size="sm" variant="ghost" icon={HandHelping} onClick={() => mark("needs_help")}>She needs help</Button>}
          </div>
          <p className="mt-2 text-xs text-muted"><BellRing className="mr-1 inline size-3.5" />KaiseHo asks {name} once, gently, and never asks for Aadhaar, PPO or bank numbers.</p>
        </>
      )}
    </Card>
  );
}

// ---------------- "What did you tell Ravi?" (P2-13) ----------------
interface Readback { familyContact: string; lastSummary: { text: string; when: string } | null; alerts: { title: string; when: string; sentTo: string[] }[]; messages: { text: string; when: string }[]; privateCount: number; notShared: string[]; say: string }

export function ReadbackCard({ elderId, name }: { elderId: string; name: string }) {
  const { data } = useApi<Readback>(`/elders/${elderId}/shared-readback`);
  return (
    <Card tone="saffron">
      <CardHeader icon={Ear} tone="saffron" kicker="Full transparency, both ways" title={`When ${name} asks “What did you tell ${data?.familyContact ?? "Ravi"}?”`} />
      {!data ? <Loader2 className="size-5 animate-spin text-muted" /> : (
        <>
          <p className="text-sm leading-relaxed">KaiseHo reads this back to her, in her language, word for word:</p>
          <blockquote className="mt-3 rounded-2xl bg-paper/80 p-4 text-[15px] leading-relaxed italic ring-1 ring-saffron/30">“{data.say}”</blockquote>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="navy">{data.lastSummary ? "1 summary" : "no summary"}</Badge>
            <Badge tone="navy">{data.alerts.length} alert{data.alerts.length === 1 ? "" : "s"}</Badge>
            <Badge tone="navy">{data.messages.length} of her messages</Badge>
            {data.privateCount > 0 && <Badge tone="forest"><Lock className="size-3" />{data.privateCount} kept private</Badge>}
          </div>
          <p className="mt-3 text-xs text-muted">She can also say “don't tell Ravi about my knee”: it becomes private from then on. Scams and emergencies always reach family.</p>
        </>
      )}
    </Card>
  );
}
