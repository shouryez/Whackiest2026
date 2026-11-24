"use client";
import { FileText } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge, Card, Empty, PageTitle, cx } from "@/components/ui";
import { clockSec, dayLabel } from "@/lib/format";
import { useApi } from "@/lib/live";

interface AuditRow { sk: string; ts: string; actor: string; tool: string; tier: "T0" | "T1" | "T2" | "T3"; argsRedacted: Record<string, unknown>; resultSummary: string; ok: boolean; callId?: string }

export default function AuditPage() {
  const { data } = useApi<AuditRow[]>("/elders/eld_lakshmi/audit");
  const [open, setOpen] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("all");
  const rows = (data ?? []).filter((r) => tier === "all" || r.tier === tier);
  return (
    <div>
      <PageTitle kicker="Radical transparency" title="Audit log">
        <div className="inline-flex rounded-xl bg-paper p-1 ring-1 ring-sand">
          {["all", "T0", "T1", "T2", "T3"].map((t) => <button key={t} onClick={() => setTier(t)} className={cx("rounded-lg px-3 py-1.5 font-mono text-sm font-bold", tier === t ? "bg-forest text-white" : "text-muted")}>{t}</button>)}
        </div>
      </PageTitle>
      <Card className="!p-0 overflow-hidden">
        {rows.length === 0 ? <div className="p-6"><Empty icon={FileText} title="No tool calls yet" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Tool</th><th className="px-4 py-3">What happened</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.sk}>
                    <tr onClick={() => setOpen(open === r.sk ? null : r.sk)} className="cursor-pointer border-t border-sand hover:bg-cream/60">
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted">{dayLabel(r.ts.slice(0, 10))} {clockSec(r.ts)}</td>
                      <td className="px-4 py-3"><Badge tone={r.tier.toLowerCase() as "t1"}>{r.tier}</Badge></td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.actor.startsWith("family:") ? `👨 ${r.actor.replace("family:mem_", "")}` : r.actor === "agent" ? "🤖 voice agent" : r.actor}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.tool}</td>
                      <td className={cx("px-4 py-3", !r.ok && "text-danger")}>{r.ok ? r.resultSummary : `⛔ ${r.resultSummary}`}</td>
                    </tr>
                    {open === r.sk && (
                      <tr className="bg-cream/50"><td colSpan={5} className="px-4 py-3"><pre className="overflow-x-auto rounded-xl bg-night p-3 font-mono text-xs text-[#c5c9e8]">{JSON.stringify(r.argsRedacted, null, 2)}</pre><p className="mt-1 text-xs text-muted">Arguments as stored: PII redacted before writing.</p></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
