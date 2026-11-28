"use client";
import { Pill, Stethoscope } from "lucide-react";
import { AppointmentsCard, PrescriptionCard } from "@/components/CareCards";
import { HealthCard } from "@/components/HealthCard";
import { HealthCardQR, VitalsCard } from "@/components/Insight";
import { MedicinesPanel } from "@/components/Panels";
import { AdherenceChart } from "@/components/cards";
import { Button, Card, CardHeader, PageTitle } from "@/components/ui";
import type { TrendPoint } from "@/lib/api";
import { useElder } from "@/lib/elder";
import { useApi } from "@/lib/live";

export default function HealthPage() {
  const { elderId, n } = useElder();
  const { data: trend } = useApi<TrendPoint[]>(`/elders/${elderId}/trends?days=14`);
  return (
    <div className="space-y-5">
      <PageTitle kicker="Health" title={<>Medicines, readings, <span className="k-grad-text font-serif font-normal italic">the doctor</span>.</>} sub={`Logged by voice in ${n}'s daily call. KaiseHo never diagnoses or changes a dose.`}>
        <Button variant="secondary" icon={Stethoscope} href={`/elder/${elderId}/brief`}>Doctor brief</Button>
      </PageTitle>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><VitalsCard elderId={elderId} /></div>
        <div className="lg:col-span-5"><HealthCard elderId={elderId} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7"><MedicinesPanel elderId={elderId} /></div>
        <Card className="lg:col-span-5">
          <CardHeader icon={Pill} tone="forest" kicker="Doses per day · 14 days" title="Adherence" />
          {trend && <AdherenceChart data={trend} />}
          <p className="mt-2 text-xs text-muted">Green = taken · red = missed. Critical medicines get one short follow-up call when a dose isn&apos;t taken yet.</p>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <AppointmentsCard elderId={elderId} name={n} />
        <PrescriptionCard elderId={elderId} />
        <HealthCardQR elderId={elderId} name={n} />
      </div>
    </div>
  );
}
