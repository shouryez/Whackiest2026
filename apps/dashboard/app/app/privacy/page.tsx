"use client";
import { Ban, Check, Database, EyeOff, FileText, Handshake, Lock, MapPin, Mic, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageTitle, Skeleton, cx } from "@/components/ui";
import { ReadbackCard } from "@/components/LifeCards";
import { post, type Privacy } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";

const TIERS = [
  ["T0", "Read", "Context, memory recall, family reads", "Auto · audited", "bg-t0"],
  ["T1", "Log", "Medicines, wellbeing, memories (PII-redacted)", "Auto · audited", "bg-t1"],
  ["T2", "Outward", "Messages, reminders, schedule, medicine edits", "Consent + rate limits", "bg-t2"],
  ["T3", "Safety override", "Scam alerts, emergencies", "Always alerts family", "bg-t3"],
  ["T∞", "Forbidden", "Money, OTP, bank, Aadhaar, PAN", "No tool exists", "bg-ink"],
] as const;

export default function PrivacyPage() {
  const { data } = useApi<Privacy>("/elders/eld_lakshmi/privacy");
  const { reset } = useLive();
  if (!data) return <Skeleton className="h-96" />;
  const choice = (on: boolean, label: string) => (
    <li className="flex items-center justify-between rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-sand">
      <span className="font-semibold">{label}</span>
      <Badge tone={on ? "forest" : "neutral"}>{on ? <><Check className="size-3" />shared</> : <><EyeOff className="size-3" />private</>}</Badge>
    </li>
  );
  return (
    <div>
      <PageTitle kicker="Minimal · consented · in India · deletable" title="Privacy & trust" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Handshake} kicker="Set by Amma, not by you" title="Her sharing choices" />
          <ul className="space-y-2">
            {choice(data.choices.shareMedicines, "Medicines")}
            {choice(data.choices.shareWellbeing, "Mood, sleep & pain")}
            {choice(data.choices.shareMemories, "Memories & plans")}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Lock className="size-4" />{data.privateCount} item{data.privateCount === 1 ? "" : "s"} she asked to keep private.</p>
          <div className="mt-4 rounded-2xl bg-saffron-soft/70 p-3 text-xs leading-relaxed">
            <p className="font-bold text-saffron-deep">Always shared, for her safety (explained to her up front):</p>
            <p className="mt-1">{data.safetyExceptions.join(" · ")}</p>
          </div>
        </Card>
        <Card>
          <CardHeader icon={Database} kicker="What we keep" title="Collect less" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3"><Mic className="mt-0.5 size-4 shrink-0 text-danger" /><span><b>Audio:</b> {data.retention.audio}.</span></li>
            <li className="flex gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-saffron-deep" /><span><b>Transcripts:</b> redacted, deleted {data.retention.transcriptHours} h after each call.</span></li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest" /><span><b>Kept:</b> {data.retention.kept}.</span></li>
            <li className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-navy" /><span><b>Where:</b> {data.location}.</span></li>
            <li className="flex gap-3"><Ban className="mt-0.5 size-4 shrink-0 text-ink" /><span><b>Never:</b> OTPs, Aadhaar, PAN, card or bank numbers. Redacted before anything is stored.</span></li>
          </ul>
          <p className="mt-4 text-xs text-muted">Designed around India's DPDP Act 2023: notice & consent, purpose limitation, data minimisation, right to erasure.</p>
        </Card>
        <Card>
          <CardHeader icon={FileText} kicker="Full transparency" title="What KaiseHo stored today" />
          {data.storedToday.length === 0 ? <p className="text-sm text-muted">Nothing yet today.</p> : (
            <ul className="space-y-1.5 text-sm">{data.storedToday.map((s, i) => <li key={i} className="rounded-xl bg-cream/70 px-3 py-2 ring-1 ring-sand">{s}</li>)}</ul>
          )}
          <p className="mt-3 text-xs text-muted">Amma can ask “what did you tell Ravi?” and hear it read back.</p>
        </Card>
      </div>

      <div className="mt-5"><ReadbackCard elderId="eld_lakshmi" name="Amma" /></div>

      <Card className="mt-5">
        <CardHeader icon={ShieldCheck} kicker="Enforced in the MCP server, not the prompt" title="Risk tiers: the LLM can be persuaded, the server can't" />
        <div className="grid gap-3 sm:grid-cols-5">
          {TIERS.map(([t, n, d, r, c]) => (
            <div key={t} className="rounded-2xl bg-cream/60 p-4 ring-1 ring-sand">
              <span className={cx("inline-grid h-9 min-w-9 place-items-center rounded-xl px-2 font-mono text-sm font-bold text-on-forest", c)}>{t}</span>
              <p className="mt-2 font-bold">{n}</p>
              <p className="mt-0.5 text-xs text-muted">{d}</p>
              <p className="mt-2 text-xs font-semibold">{t === "T∞" ? <span className="text-danger"><X className="mr-0.5 inline size-3" />{r}</span> : r}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card tone="danger" className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">Delete everything</h2>
            <p className="text-sm text-muted">Wipes every record for this family: calls, summaries, memories, medicines, alerts, audit. Cannot be undone.</p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={async () => {
            if (!confirm("Delete ALL of this family's data? (Demo: use Reset on Live Ops to seed again.)")) return;
            await post("/family/delete-all"); reset();
          }}>Delete all data</Button>
        </div>
      </Card>
    </div>
  );
}
