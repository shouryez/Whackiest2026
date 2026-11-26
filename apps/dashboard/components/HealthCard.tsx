"use client";
import { Activity, GraduationCap, Pill, Stethoscope } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/live";
import { Badge, Button, Card, CardHeader, cx } from "./ui";

interface Health {
  refills: { medId: string; name: string; stock: number; perDay: number; daysLeft: number; runsOut: string }[];
  changes: { metric: string; from: number; to: number; text: string }[];
  drills: { total: number; passed: number; pct: number | null; recent: { date: string; question: string; passed: boolean }[] };
}

/** Phase 5: refill countdown, changes worth discussing with a doctor, scam-drill score. */
export function HealthCard({ elderId }: { elderId: string }) {
  const { data, reload } = useApi<Health>(`/elders/${elderId}/health`);
  const [edit, setEdit] = useState<Record<string, string>>({});
  if (!data) return null;
  return (
    <Card>
      <CardHeader icon={Activity} tone="navy" kicker="Noticed for you" title="Health & safety"
        action={<Button size="sm" variant="secondary" icon={Stethoscope} href={`/elder/${elderId}/brief`}>Doctor brief</Button>} />

      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted"><Pill className="size-3.5" />Medicine stock</p>
      <ul className="space-y-2">
        {data.refills.length === 0 && <li className="text-sm text-muted">Add a tablet count to a medicine to get refill reminders.</li>}
        {data.refills.map((r) => {
          const tone = r.daysLeft <= 2 ? "bg-danger" : r.daysLeft <= 5 ? "bg-saffron" : "bg-[#2e9e5b]";
          return (
            <li key={r.medId} className="rounded-2xl bg-cream/70 p-3 ring-1 ring-sand">
              <div className="flex items-center justify-between gap-2 text-sm">
                <b>{r.name}</b>
                <Badge tone={r.daysLeft <= 2 ? "danger" : r.daysLeft <= 5 ? "saffron" : "forest"}>{r.daysLeft} day{r.daysLeft === 1 ? "" : "s"} left</Badge>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand/60"><div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.min(100, (r.daysLeft / 30) * 100)}%` }} /></div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{r.stock} tablets · {r.perDay}/day · runs out {new Date(`${r.runsOut}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                <span className="ml-auto flex items-center gap-1">
                  <input type="number" min={0} placeholder="refilled to…" value={edit[r.medId] ?? ""} onChange={(e) => setEdit({ ...edit, [r.medId]: e.target.value })}
                    className="w-24 rounded-lg border border-sand-deep bg-paper px-2 py-1 text-xs outline-none focus:border-saffron" />
                  <Button size="sm" variant="ghost" disabled={!edit[r.medId]} onClick={async () => {
                    await api(`/elders/${elderId}/medications/${r.medId}`, { method: "PATCH", body: JSON.stringify({ stockCount: Number(edit[r.medId]) }) });
                    setEdit({ ...edit, [r.medId]: "" }); reload();
                  }}>Save</Button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted"><Stethoscope className="size-3.5" />This week vs last week</p>
      {data.changes.length === 0 ? (
        <p className="rounded-xl bg-forest-soft px-3 py-2 text-sm text-forest">No significant changes in mood, pain, sleep or medicines.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.changes.map((c) => <li key={c.metric} className="rounded-xl bg-saffron-soft px-3 py-2 text-sm">⚠️ {c.text}. <span className="text-muted">Worth discussing with her doctor (not a diagnosis).</span></li>)}
        </ul>
      )}

      <p className="mt-5 mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted"><GraduationCap className="size-3.5" />Scam safety quiz (weekly)</p>
      {data.drills.total === 0 ? (
        <p className="text-sm text-muted">Once a week KaiseHo asks one 30-second safety question, so she recognises scams before they call.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="text-center"><p className="font-display text-3xl font-semibold text-forest">{data.drills.pct}%</p><p className="text-xs text-muted">{data.drills.passed}/{data.drills.total} safe answers</p></div>
          <ul className="flex-1 space-y-1 text-xs">{data.drills.recent.map((d, i) => <li key={i}>{d.passed ? "✅" : "📚"} {d.question}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}
