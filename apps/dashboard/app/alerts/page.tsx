"use client";
import { Bell, Check, HeartPulse, Info, MessageCircleHeart, PhoneOff, ShieldAlert, Siren } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Empty, PageTitle, cx } from "@/components/ui";
import { post, type Alert } from "@/lib/api";
import { clock, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";

const ICON: Record<string, typeof Bell> = { scam: ShieldAlert, emergency: Siren, no_answer: PhoneOff, message: MessageCircleHeart, low_mood: HeartPulse, missed_meds: HeartPulse, health_change: HeartPulse };
const FILTERS = [["open", "Needs action"], ["all", "Everything"], ["scam", "Scams"], ["emergency", "Emergencies"], ["message", "Messages"]] as const;

export default function AlertsPage() {
  const { data } = useApi<Alert[]>("/alerts");
  const { bump } = useLive();
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("open");
  const list = (data ?? []).filter((a) =>
    f === "all" ? true : f === "open" ? a.status === "open" && a.severity !== "info" : a.type === f);

  return (
    <div>
      <PageTitle kicker="Routed by severity" title="Alerts">
        <div className="inline-flex flex-wrap rounded-xl bg-paper p-1 ring-1 ring-sand">
          {FILTERS.map(([k, l]) => <button key={k} onClick={() => setF(k)} className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", f === k ? "bg-forest text-white" : "text-muted hover:text-ink")}>{l}</button>)}
        </div>
      </PageTitle>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[["info", "Dashboard + evening digest", "neutral"], ["watch", "Included in the daily summary", "saffron"], ["urgent", "Instant Telegram to Ravi (+ Priya for scams)", "danger"], ["emergency", "Everyone + briefing calls + neighbour", "danger"]].map(([s, d, t]) => (
          <div key={s} className="rounded-2xl bg-paper p-3 ring-1 ring-sand"><Badge tone={t as "neutral"}>{s}</Badge><p className="mt-1.5 text-xs text-muted">{d}</p></div>
        ))}
      </div>
      {list.length === 0 ? <Empty icon={Check} title="Nothing needs you right now">KaiseHo will alert you the moment something does.</Empty> : (
        <div className="space-y-3">
          {list.map((a) => {
            const Icon = ICON[a.type] ?? Info;
            const hot = a.severity === "urgent" || a.severity === "emergency";
            return (
              <Card key={a.alertId} tone={hot && a.status === "open" ? "danger" : "paper"} className="animate-fade-up !p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span className={cx("grid size-11 shrink-0 place-items-center rounded-2xl", hot ? "bg-danger text-white" : "bg-forest-soft text-forest")}><Icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{a.title}</h3>
                      <Badge tone={hot ? "danger" : a.severity === "watch" ? "saffron" : "neutral"}>{a.severity}</Badge>
                      {a.status === "acked" && <Badge tone="forest"><Check className="size-3" />acknowledged</Badge>}
                    </div>
                    <p className="mt-1 text-[15px] leading-relaxed">{a.body}</p>
                    <p className="mt-2 text-xs text-muted">{clock(a.createdAt)} · {timeAgo(a.createdAt)} · sent via {a.notifiedVia.join(", ")}{a.type === "scam" && " · Cyber-fraud helpline 1930"}{a.type === "emergency" && " · Emergency 112"}</p>
                  </div>
                  {a.status === "open" && hot && <Button icon={Check} onClick={async () => { await post(`/alerts/${a.alertId}/ack`); bump(); }}>Acknowledge</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
