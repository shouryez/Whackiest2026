"use client";
import { Building2, CalendarCheck, Camera, Check, Loader2, PhoneOutgoing, RotateCw, ScanText } from "lucide-react";
import { useRef, useState } from "react";
import { post } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader, cx } from "./ui";

// ---------------- appointments (clinic-calling agent, P2-14) ----------------
interface Appt { appointmentId: string; clinicName: string; doctor: string; preferred: string; status: string; slotSpoken?: string; notes?: string; mode?: string; requestedBy: string; createdAt: string }
const STATUS: Record<string, { label: string; tone: "forest" | "saffron" | "danger" | "neutral" | "navy" }> = {
  requested: { label: "Requested", tone: "neutral" }, calling: { label: "Calling clinic…", tone: "saffron" }, confirmed: { label: "Booked", tone: "forest" },
  no_slot: { label: "No slot", tone: "danger" }, failed: { label: "Call failed", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

export function AppointmentsCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<{ clinics: { clinicId: string; name: string; doctor: string }[]; appointments: Appt[] }>(`/elders/${elderId}/appointments`);
  const { bump } = useLive();
  const [preferred, setPreferred] = useState("Thursday morning");
  const [busy, setBusy] = useState(false);
  const clinic = data?.clinics[0];
  return (
    <Card>
      <CardHeader icon={CalendarCheck} tone="navy" kicker="KaiseHo calls the clinic for her" title="Doctor appointments" />
      {clinic ? (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted"><Building2 className="size-4" />{clinic.doctor} · {clinic.name}</p>
      ) : <p className="mb-3 text-sm text-muted">No clinic saved yet.</p>}
      <div className="flex gap-2">
        <input value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="e.g. Thursday morning"
          className="min-w-0 flex-1 rounded-xl border border-sand-deep bg-paper px-3 py-2 text-sm outline-none focus:border-saffron" />
        <Button icon={busy ? Loader2 : PhoneOutgoing} disabled={!clinic || busy || preferred.trim().length < 2} onClick={async () => {
          setBusy(true);
          try { await post(`/elders/${elderId}/appointments`, { preferred }); reload(); bump(); } finally { setBusy(false); }
        }}>Book</Button>
      </div>
      <p className="mt-2 text-xs text-muted">The AI says it's an AI and shares only {name}'s name and "follow-up visit". {name} can also ask by voice: "Dr. Rao ke saath Thursday ko appointment fix karo" ("fix my appointment with Dr. Rao on Thursday").</p>
      <ul className="mt-4 space-y-2">
        {(data?.appointments ?? []).slice(0, 5).map((a) => (
          <li key={a.appointmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-sand">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.slotSpoken ?? a.preferred} · {a.doctor}</p>
              <p className="text-xs text-muted">{a.requestedBy === "elder" ? `asked by ${name} in a call` : "booked from the dashboard"}{a.mode === "simulated" ? " · simulated clinic call" : ""}{a.notes ? ` · ${a.notes}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS[a.status]?.tone ?? "neutral"}>{a.status === "confirmed" && <Check className="size-3" />}{STATUS[a.status]?.label ?? a.status}</Badge>
              {(a.status === "no_slot" || a.status === "failed") && (
                <Button size="sm" variant="ghost" icon={RotateCw} onClick={async () => { await post(`/elders/${elderId}/appointments/${a.appointmentId}/call`); reload(); }}>Retry</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------- prescription photo → schedule (P2-2) ----------------
interface Draft { name: string; dose: string; slots: string[]; withFood?: string; duration?: string; frequencyText: string; asNeeded: boolean; confidence: number; needsReview: boolean }
const SLOTS = ["morning", "afternoon", "evening", "night"];

export function PrescriptionCard({ elderId, onSaved }: { elderId: string; onSaved?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { bump } = useLive();
  const [state, setState] = useState<"idle" | "reading" | "review" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<(Draft & { keep: boolean })[]>([]);
  const [meta, setMeta] = useState<{ doctor?: string; unreadable: string[] }>({ unreadable: [] });

  const upload = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError("Photo is too large (max 5 MB).");
    setState("reading");
    const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const out = await post<{ medicines: Draft[]; doctor?: string; unreadable: string[] }>(`/elders/${elderId}/prescription`, { image: dataUrl });
      setRows(out.medicines.map((m) => ({ ...m, keep: !m.asNeeded })));
      setMeta({ doctor: out.doctor, unreadable: out.unreadable });
      setState("review");
    } catch (e) {
      setError((e as Error).message); setState("idle");
    }
  };
  const save = async () => {
    setState("saving");
    for (const r of rows.filter((x) => x.keep && x.slots.length)) {
      await post(`/elders/${elderId}/medications`, { name: r.name, dose: r.dose || "as prescribed", slots: r.slots, ...(r.withFood && r.withFood !== "any" ? { withFood: r.withFood } : {}) });
    }
    setState("done"); bump(); onSaved?.();
  };

  return (
    <Card>
      <CardHeader icon={ScanText} tone="saffron" kicker="Photo → schedule · you confirm every line" title="Read a prescription" />
      {state === "idle" || state === "reading" ? (
        <>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button icon={state === "reading" ? Loader2 : Camera} disabled={state === "reading"} onClick={() => input.current?.click()}>
            {state === "reading" ? "Reading the prescription…" : "Upload prescription photo"}
          </Button>
          <p className="mt-2 text-xs text-muted">The photo is read once and never stored. Shorthand like 1-0-1, BD, HS is decoded for you. Nothing is saved until you confirm.</p>
          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </>
      ) : state === "done" ? (
        <p className="rounded-xl bg-forest-soft px-3 py-2 text-sm text-forest">✓ Saved. KaiseHo will ask about these from the next call. <button className="underline" onClick={() => { setState("idle"); setRows([]); }}>Read another</button></p>
      ) : (
        <>
          {meta.doctor && <p className="mb-2 text-sm text-muted">Prescribed by {meta.doctor}</p>}
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className={cx("rounded-2xl p-3 ring-1", r.needsReview ? "bg-saffron-soft/60 ring-saffron/40" : "bg-cream/70 ring-sand")}>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={r.keep} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, keep: e.target.checked } : x))} />
                  <input value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="min-w-0 flex-1 rounded-lg border border-sand-deep bg-paper px-2 py-1 text-sm font-semibold" />
                  <input value={r.dose} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} placeholder="dose" className="w-24 rounded-lg border border-sand-deep bg-paper px-2 py-1 text-sm" />
                  {r.needsReview && <Badge tone="saffron">check this</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">“{r.frequencyText || "?"}”{r.duration ? ` · ${r.duration}` : ""}{r.asNeeded ? " · only when needed" : ""} →</span>
                  {SLOTS.map((s) => (
                    <button key={s} onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, slots: x.slots.includes(s) ? x.slots.filter((y) => y !== s) : [...x.slots, s] } : x))}
                      className={cx("rounded-full px-2.5 py-0.5 font-semibold ring-1", r.slots.includes(s) ? "bg-forest text-white ring-forest" : "bg-paper text-muted ring-sand-deep")}>{s}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {meta.unreadable.length > 0 && <p className="mt-2 text-xs text-danger">Couldn't read: {meta.unreadable.join("; ")}. Please add these by hand.</p>}
          <div className="mt-3 flex gap-2">
            <Button icon={Check} disabled={state === "saving" || !rows.some((r) => r.keep)} onClick={save}>{state === "saving" ? "Saving…" : `Save ${rows.filter((r) => r.keep).length} medicine(s)`}</Button>
            <Button variant="ghost" onClick={() => { setState("idle"); setRows([]); }}>Cancel</Button>
          </div>
          <p className="mt-2 text-xs text-muted">KaiseHo never changes doses. If anything looks wrong, check with the doctor or pharmacist.</p>
        </>
      )}
    </Card>
  );
}
