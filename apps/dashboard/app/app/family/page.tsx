"use client";
import { RotaCard, VoiceNoteCard } from "@/components/Insight";
import { ReadbackCard } from "@/components/LifeCards";
import { MembersCard, MessagesPanel, NeedsBoard } from "@/components/Panels";
import { PageTitle } from "@/components/ui";
import { useElder } from "@/lib/elder";

export default function FamilyPage() {
  const { elderId, n } = useElder();
  return (
    <div className="space-y-5">
      <PageTitle kicker="The family" title={<>Everyone on the <span className="k-grad-text font-serif font-normal italic">same page</span>.</>} sub={`Who's buying the gas, whose turn it is to call, and what ${n} hears about each of you. Shared by every sibling, on the web and on Telegram.`} />
      <NeedsBoard elderId={elderId} name={n} />
      <div className="grid gap-5 lg:grid-cols-12">
        <section id="messages" className="scroll-mt-24 lg:col-span-7"><MessagesPanel elderId={elderId} name={n} /></section>
        <div className="space-y-5 lg:col-span-5"><RotaCard elderId={elderId} name={n} /><VoiceNoteCard elderId={elderId} name={n} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><ReadbackCard elderId={elderId} name={n} /></div>
        <div className="lg:col-span-5"><MembersCard name={n} /></div>
      </div>
    </div>
  );
}
