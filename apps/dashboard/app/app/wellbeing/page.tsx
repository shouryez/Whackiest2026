"use client";
import { Brain, Sparkles, TrendingUp } from "lucide-react";
import { Constellation, IndexRiver, InsightCards, PatternList, STATUS_WORD, type Wellbeing } from "@/components/Insight";
import { MindGymCard } from "@/components/Panels";
import { MoodPainChart, TodayCard } from "@/components/cards";
import { Card, CardHeader, CountUp, PageTitle, Skeleton } from "@/components/ui";
import type { TodayView } from "@/lib/api";
import { useElder } from "@/lib/elder";
import { useApi } from "@/lib/live";

export default function WellbeingPage() {
  const { elderId, n } = useElder();
  const { data: w } = useApi<Wellbeing>(`/elders/${elderId}/wellbeing`);
  const { data: today } = useApi<TodayView>(`/elders/${elderId}`);
  return (
    <div className="space-y-5">
      <PageTitle kicker="Wellbeing" title={<>How {n} is, <span className="k-grad-text font-serif font-normal italic">really</span>.</>} sub="Read from conversation, never from ratings. Every number is compared only with her own usual, never with other people." />
      {w ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card glow className="lg:col-span-5">
            <CardHeader icon={Sparkles} tone="saffron" kicker="Six dimensions · this week vs last" title="Her constellation" />
            <div className="relative mx-auto w-full max-w-[330px]">
              <Constellation w={w} size={330} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><p className="font-display text-[3.2rem] leading-none font-semibold"><CountUp value={w.today?.index ?? 0} /></p><p className="k-label text-muted">today</p></div></div>
            </div>
            <p className="text-center text-sm"><span className="font-semibold">{STATUS_WORD[w.status]}</span>{w.baseline.n >= 5 ? <span className="text-muted"> · her usual {w.baseline.mean} ± {w.baseline.sd}</span> : ""}</p>
            {w.voice && <p className="mx-auto mt-3 w-fit rounded-full bg-ink/[0.04] px-3.5 py-1.5 text-center text-[12px] text-muted ring-1 ring-sand">🎙️ Voice vitality · {w.voice.wpm} words/min · replies in {w.voice.replyGapSec.toFixed(1)}s</p>}
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
      ) : <Skeleton className="h-96" />}
      <div>
        <p className="k-label mb-3 text-saffron">AI insight cards · refreshed daily</p>
        <InsightCards elderId={elderId} wide />
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><MindGymCard elderId={elderId} name={n} /></div>
        <div className="space-y-5 lg:col-span-5">
          {today && <TodayCard v={today} />}
          <Card>
            <CardHeader icon={TrendingUp} tone="rose" kicker="14 days" title="Mood & pain" />
            {today && <MoodPainChart data={today.trend} height={190} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
