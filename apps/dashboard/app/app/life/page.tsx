"use client";
import { OccasionsCard, PensionCard, RemindersCard } from "@/components/LifeCards";
import { PageTitle } from "@/components/ui";
import { useElder } from "@/lib/elder";

export default function LifePage() {
  const { elderId, n } = useElder();
  return (
    <div className="space-y-5">
      <PageTitle kicker="Life admin" title={<>The little things that <span className="k-grad-text font-serif font-normal italic">matter</span>.</>} sub={`Reminder calls, birthdays and festivals, and the pension life certificate every November. Set by the family, or by ${n} herself by voice.`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <RemindersCard elderId={elderId} name={n} />
        <OccasionsCard elderId={elderId} name={n} />
        <PensionCard elderId={elderId} name={n} />
      </div>
    </div>
  );
}
