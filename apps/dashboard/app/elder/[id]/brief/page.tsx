"use client";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/live";

interface Brief {
  elder: { name: string; preferredName: string; age?: number; city: string; conditions: string[] };
  nextAppointment: { doctor: string; clinic: string; when?: string } | null;
  period: { from: string; to: string; days: number };
  callsCompleted: number;
  medicines: { name: string; schedule: string; taken: number; logged: number; adherencePct: number | null; missedDates: string[] }[];
  mood: { average: number | null; lowDays: string[] };
  pain: { date: string; where: string; level: number }[];
  sleepPoorDays: number;
  changes: { text: string }[];
  events: { date: string; type: string; title: string }[];
  healthNotes: { date: string; text: string }[];
  questionsForDoctor: string[];
  disclaimer: string;
}
const d = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Printable one-page doctor brief (plan.md P2-4). */
export default function DoctorBrief() {
  const { id } = useParams<{ id: string }>();
  const { data: b } = useApi<Brief>(`/elders/${id}/doctor-brief?days=30`);
  if (!b) return <Skeleton className="h-[80vh]" />;
  const maxPain = Math.max(10, ...b.pain.map((p) => p.level));
  return (
    <div className="mx-auto max-w-3xl">
      <style>{`@media print { aside, header, nav, .no-print { display: none !important; } body { background: white !important; } main { padding: 0 !important; } .sheet { box-shadow: none !important; border: none !important; } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" icon={ArrowLeft} href={`/elder/${id}`}>Back</Button>
        <Button icon={Printer} onClick={() => window.print()}>Print / save as PDF</Button>
      </div>
      <article className="sheet rounded-3xl border border-sand bg-white p-8 text-[14px] leading-relaxed shadow-[var(--shadow-card)]">
        <header className="flex items-start justify-between border-b border-sand pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-saffron-deep">Doctor brief · {b.period.days} days</p>
            <h1 className="font-display text-3xl font-semibold">{b.elder.name} ({b.elder.preferredName}), {b.elder.age}</h1>
            <p className="text-muted">{b.elder.city} · {b.elder.conditions.join(", ")}</p>
            {b.nextAppointment && <p className="mt-1 text-sm font-semibold text-forest">Next visit: {b.nextAppointment.when} · {b.nextAppointment.doctor}, {b.nextAppointment.clinic}</p>}
          </div>
          <div className="text-right text-xs text-muted"><p>{d(b.period.from)} – {d(b.period.to)}</p><p>{b.callsCompleted} check-in calls</p><p>KaiseHo</p></div>
        </header>

        <section className="mt-5">
          <h2 className="mb-2 font-bold">Medicines</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-1">Medicine</th><th>Schedule</th><th>Taken</th><th>Missed on</th></tr></thead>
            <tbody>{b.medicines.map((m) => (
              <tr key={m.name} className="border-t border-sand"><td className="py-1.5 font-semibold">{m.name}</td><td>{m.schedule}</td><td>{m.adherencePct === null ? <span className="text-muted">new · not asked yet</span> : `${m.adherencePct}% (${m.taken}/${m.logged})`}</td><td className="text-xs">{m.missedDates.map(d).join(", ") || "—"}</td></tr>
            ))}</tbody>
          </table>
        </section>

        <section className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 font-bold">Mood & sleep</h2>
            <p>Average mood <b>{b.mood.average ?? "—"}/5</b>{b.mood.lowDays.length ? `; low on ${b.mood.lowDays.map(d).join(", ")}` : ""}.</p>
            <p>Poor sleep on <b>{b.sleepPoorDays}</b> day{b.sleepPoorDays === 1 ? "" : "s"}.</p>
          </div>
          <div>
            <h2 className="mb-2 font-bold">Pain ({b.pain[0]?.where ?? "none reported"})</h2>
            <div className="flex h-16 items-end gap-0.5">{b.pain.map((p) => <div key={p.date} title={`${d(p.date)}: ${p.level}/10`} className="flex-1 rounded-t bg-[#c96a0c]/70" style={{ height: `${(p.level / maxPain) * 100}%` }} />)}</div>
            <p className="mt-1 text-xs text-muted">{b.pain.length ? `${b.pain[0].level}/10 → ${b.pain.at(-1)!.level}/10` : ""}</p>
          </div>
        </section>

        {(b.changes.length > 0 || b.events.length > 0) && (
          <section className="mt-5">
            <h2 className="mb-2 font-bold">Changes & events</h2>
            <ul className="list-disc space-y-0.5 pl-5">
              {b.changes.map((c) => <li key={c.text}>{c.text}</li>)}
              {b.events.slice(0, 6).map((e, i) => <li key={i}>{d(e.date)}: {e.title}</li>)}
            </ul>
          </section>
        )}

        {b.healthNotes.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 font-bold">What she mentioned</h2>
            <ul className="list-disc space-y-0.5 pl-5">{b.healthNotes.map((n, i) => <li key={i}>{d(n.date)}: {n.text}</li>)}</ul>
          </section>
        )}

        <section className="mt-5 rounded-2xl bg-saffron-soft/60 p-4">
          <h2 className="mb-2 font-bold">Questions to ask the doctor</h2>
          <ol className="list-decimal space-y-1 pl-5">{b.questionsForDoctor.map((q) => <li key={q}>{q}</li>)}</ol>
        </section>
        <p className="mt-5 text-xs text-muted">{b.disclaimer}</p>
      </article>
    </div>
  );
}
