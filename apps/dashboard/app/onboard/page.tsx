"use client";
import { ArrowLeft, ArrowRight, Check, Handshake, HeartHandshake, Phone, PhoneCall, Pill, Plus, ShieldCheck, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, PageTitle, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { cap } from "@/lib/format";
import { useLive } from "@/lib/live";

const STEPS = [["parent", "Your parent", User], ["medicines", "Medicines", Pill], ["consent", "Consent call", Handshake]] as const;
const input = "w-full rounded-xl border border-sand-deep bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30";

export default function Onboard() {
  const { bump } = useLive();
  const [step, setStep] = useState(0);
  const [p, setP] = useState({ gender: "male" as "female" | "male" | "other", name: "", preferredName: "Appa", age: 72, language: "hi" as "kn" | "hi" | "en", phone: "+91 ", city: "Pune", callTimeLocal: "09:30", conditions: "" });
  const [meds, setMeds] = useState<{ name: string; dose: string; slots: string[] }[]>([{ name: "", dose: "", slots: ["morning"] }]);
  const [elderId, setElderId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "calling" | "called" | "error">("idle");
  const [err, setErr] = useState("");

  const valid0 = p.name.length >= 2 && p.preferredName && /^\+?\d[\d\s-]{8,15}$/.test(p.phone) && p.city.length >= 2;
  const create = async () => {
    setState("saving"); setErr("");
    try {
      const r = await post<{ elderId: string }>("/onboard", {
        elder: { ...p, age: Number(p.age) || undefined, conditions: p.conditions.split(",").map((s) => s.trim()).filter(Boolean) },
        medicines: meds.filter((m) => m.name && m.dose && m.slots.length),
      });
      setElderId(r.elderId); setStep(2); setState("idle"); bump();
    } catch (e) { setErr((e as Error).message); setState("error"); }
  };
  const call = async () => {
    if (!elderId) return;
    setState("calling");
    try { await post(`/elders/${elderId}/welcome-call`); setState("called"); bump(); } catch (e) { setErr((e as Error).message); setState("error"); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle kicker="Takes 2 minutes" title="Add a parent" />
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map(([k, l, Icon], i) => (
          <li key={k} className={cx("flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold ring-1", i === step ? "bg-forest text-white ring-forest" : i < step ? "bg-forest-soft text-forest ring-forest/20" : "bg-paper text-muted ring-sand")}>
            <span className={cx("grid size-7 place-items-center rounded-full text-xs", i === step ? "bg-white/20" : i < step ? "bg-forest text-white" : "bg-sand/60")}>{i < step ? <Check className="size-4" /> : <Icon className="size-4" />}</span>{l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="animate-fade-up space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Full name<input className={cx(input, "mt-1")} placeholder="e.g. Ramesh Kulkarni" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
            <label className="text-sm font-semibold">What KaiseHo should call them<input className={cx(input, "mt-1")} placeholder="Appa / Amma / Aaji" value={p.preferredName} onChange={(e) => setP({ ...p, preferredName: e.target.value })} /></label>
            <label className="text-sm font-semibold">Their phone (any phone works)<input className={cx(input, "mt-1")} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></label>
            <label className="text-sm font-semibold">City<input className={cx(input, "mt-1")} value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
            <label className="text-sm font-semibold">Age<input type="number" className={cx(input, "mt-1")} value={p.age} onChange={(e) => setP({ ...p, age: Number(e.target.value) })} /></label>
            <label className="text-sm font-semibold">Preferred call time<input type="time" className={cx(input, "mt-1")} value={p.callTimeLocal} onChange={(e) => setP({ ...p, callTimeLocal: e.target.value })} /></label>
          </div>
          <div>
            <p className="text-sm font-semibold">They are your</p>
            <div className="mt-1.5 flex gap-2">
              {([["female", "Mother", "Amma"], ["male", "Father", "Appa"], ["other", "Other", ""]] as const).map(([k, l, nick]) => (
                <button key={k} onClick={() => setP({ ...p, gender: k, preferredName: nick || p.preferredName })} className={cx("rounded-xl px-4 py-2 text-sm font-semibold ring-1", p.gender === k ? "bg-forest text-white ring-forest" : "bg-paper ring-sand-deep")}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Language for the calls</p>
            <div className="mt-1.5 flex gap-2">
              {([["kn", "ಕನ್ನಡ Kannada"], ["hi", "हिन्दी Hindi"], ["en", "English"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setP({ ...p, language: k })} className={cx("rounded-xl px-4 py-2 text-sm font-semibold ring-1", p.language === k ? "bg-forest text-white ring-forest" : "bg-paper ring-sand-deep")}>{l}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-semibold">Health conditions (optional, comma-separated)<input className={cx(input, "mt-1")} placeholder="BP, diabetes" value={p.conditions} onChange={(e) => setP({ ...p, conditions: e.target.value })} /></label>
          <div className="flex justify-end"><Button icon={ArrowRight} disabled={!valid0} onClick={() => setStep(1)}>Next: medicines</Button></div>
        </Card>
      )}

      {step === 1 && (
        <Card className="animate-fade-up">
          <p className="mb-4 text-sm text-muted">KaiseHo asks about each medicine <b>by name</b> at the right time of day. It never advises on doses.</p>
          <div className="space-y-3">
            {meds.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-2xl bg-cream/70 p-3 ring-1 ring-sand sm:grid-cols-[1fr_120px_auto]">
                <input className={input} placeholder="Medicine, e.g. Amlodipine" value={m.name} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input className={input} placeholder="Dose, e.g. 5 mg" value={m.dose} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} />
                <button onClick={() => setMeds(meds.filter((_, j) => j !== i))} className="rounded-xl p-2.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
                <div className="flex flex-wrap gap-1.5 sm:col-span-3">
                  {["morning", "afternoon", "evening", "night"].map((s) => (
                    <button key={s} onClick={() => setMeds(meds.map((x, j) => j === i ? { ...x, slots: x.slots.includes(s) ? x.slots.filter((y) => y !== s) : [...x.slots, s] } : x))}
                      className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", m.slots.includes(s) ? "bg-forest text-white ring-forest" : "bg-paper text-muted ring-sand-deep")}>{cap(s)}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" icon={Plus} className="mt-3" onClick={() => setMeds([...meds, { name: "", dose: "", slots: ["morning"] }])}>Add another</Button>
          {err && <p className="mt-3 text-sm text-danger">{err}</p>}
          <div className="mt-5 flex justify-between">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(0)}>Back</Button>
            <Button icon={ArrowRight} disabled={state === "saving"} onClick={create}>{state === "saving" ? "Saving…" : "Save & continue"}</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card tone="saffron" className="animate-fade-up">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest text-white"><ShieldCheck className="size-6" /></span>
            <div>
              <h2 className="font-display text-2xl font-semibold">Consent comes first</h2>
              <p className="mt-1 text-[15px] leading-relaxed">
                <b>No daily calls are scheduled yet.</b> KaiseHo will make one welcome call to {p.preferredName}. It says clearly that it's an AI,
                explains the daily check-in, asks if that's okay and at what time, and asks what they're happy to share with you.
                Only if {p.preferredName} says yes do the daily calls begin. They can stop them any time with one sentence.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {["Discloses it's an AI in the first sentence", "They choose what's shared with you", "Scams & emergencies always reach you (they're told)"].map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-xl bg-paper/80 px-3 py-2 ring-1 ring-saffron/25"><Check className="size-4 shrink-0 text-forest" />{t}</li>
            ))}
          </ul>
          {state === "called" ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4 ring-1 ring-forest/30">
              <PhoneCall className="size-5 text-forest" />
              <p className="flex-1 text-sm"><b>Welcome call started.</b> Watch it live: consent is recorded by the agent, and the schedule activates only on a yes.</p>
              <Button variant="secondary" href="/live">Watch on Live Ops</Button>
              {elderId && <Button href={`/elder/${elderId}`}>Open {p.preferredName}'s page</Button>}
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" icon={Phone} disabled={state === "calling"} onClick={call}>{state === "calling" ? "Calling…" : `Make the welcome call to ${p.preferredName}`}</Button>
              <Badge tone="navy"><HeartHandshake className="size-3" />{p.name} · {p.city}</Badge>
            </div>
          )}
          {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        </Card>
      )}
      <p className="mt-6 text-center text-xs text-muted"><Link href="/" className="hover:underline">Cancel and go back</Link></p>
    </div>
  );
}
