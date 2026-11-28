"use client";
import { PhoneOutgoing, Play, Radio } from "lucide-react";
import { useState } from "react";
import { DigestCard } from "@/components/DigestCard";
import { CallStyleCard, CallTimeline, ScheduleCard } from "@/components/Panels";
import { Button, PageTitle } from "@/components/ui";
import { post } from "@/lib/api";
import { useElder } from "@/lib/elder";
import { useLive } from "@/lib/live";

export default function CallsPage() {
  const { elderId, n } = useElder();
  const { bump } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (k: string, path: string, body?: unknown) => { setBusy(k); try { await post(path, body); bump(); } finally { setTimeout(() => setBusy(null), 1500); } };
  return (
    <div className="space-y-5">
      <PageTitle kicker="Calls" title={<>One call a day, <span className="k-grad-text font-serif font-normal italic">her way</span>.</>} sub={`In ${n}'s language, at her time, in the style she likes. Every call is summarised and quality-checked; the raw transcript is deleted after 24 hours.`}>
        <Button variant="secondary" icon={Radio} href="/live">Live Ops</Button>
        <Button variant="secondary" icon={Play} disabled={busy === "p"} onClick={() => act("p", "/demo/play-call", { scam: true, elderId })}>{busy === "p" ? "Playing…" : "Play demo call"}</Button>
        <Button icon={PhoneOutgoing} disabled={busy === "c"} onClick={() => act("c", `/elders/${elderId}/call-now`)}>{busy === "c" ? "Ringing…" : `Call ${n} now`}</Button>
      </PageTitle>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><CallStyleCard elderId={elderId} name={n} /></div>
        <div className="lg:col-span-5"><ScheduleCard elderId={elderId} name={n} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8"><CallTimeline elderId={elderId} name={n} /></div>
        <div className="lg:col-span-4"><DigestCard elderId={elderId} name={n} /></div>
      </div>
    </div>
  );
}
