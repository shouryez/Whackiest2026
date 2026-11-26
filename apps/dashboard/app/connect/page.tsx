"use client";
import { Bot, Check, Copy, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, PageTitle } from "@/components/ui";
import { API, TOKEN, type Integrations, type Overview } from "@/lib/api";
import { useApi } from "@/lib/live";

function CopyBox({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-night px-3 py-2.5 font-mono text-xs text-[#c5c9e8]">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{value}</code>
      <button onClick={() => { void navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }} className="rounded-md p-1 hover:bg-white/10" aria-label="Copy">{ok ? <Check className="size-3.5 text-[#6ee7a0]" /> : <Copy className="size-3.5" />}</button>
    </div>
  );
}

export default function ConnectPage() {
  const { data: ov } = useApi<Overview>("/family/overview");
  const { data: integ } = useApi<Integrations>("/health/integrations");
  // Claude runs in the cloud, so it needs the public (tunnel / AWS) URL, not localhost.
  const [mcp, setMcp] = useState(`${API}/mcp/family`);
  useEffect(() => { fetch(`${API}/health`).then((r) => r.json()).then((h) => h.mcpFamily && setMcp(h.mcpFamily)).catch(() => {}); }, []);
  return (
    <div>
      <PageTitle kicker="One brain, two doors" title="Connect" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Bot} tone="navy" kicker="Door 2 · for you" title="Ask Claude about Amma" />
          <p className="text-sm text-muted">Add KaiseHo as a custom MCP connector. Then ask “How was Amma this week?”, “What should I talk to her about tonight?”, or “Her doctor added Telmisartan 40 mg at 9 PM”.</p>
          <p className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-muted">claude.ai → Settings → Connectors → Add custom connector (URL)</p>
          <CopyBox value={`${mcp}?token=${TOKEN}`} />
          <p className="mt-3 mb-1 text-xs font-bold uppercase tracking-wider text-muted">Claude Code (terminal)</p>
          <CopyBox value={`claude mcp add --transport http kaiseho ${mcp} --header "Authorization: Bearer ${TOKEN}"`} />
          <p className="mt-3 mb-1 text-xs font-bold uppercase tracking-wider text-muted">Claude Desktop (claude_desktop_config.json → mcpServers)</p>
          <CopyBox value={`"kaiseho": { "command": "npx", "args": ["-y", "mcp-remote", "${mcp}", "--header", "Authorization: Bearer ${TOKEN}"] }`} />
          <p className="mt-3 text-xs text-muted">These contain your family token: don't share them. The tunnel URL changes when it restarts; on AWS it stays fixed.</p>
        </Card>
        <Card>
          <CardHeader icon={MessageCircle} tone="saffron" kicker="Alerts on your phone" title="Link Telegram" />
          <p className="text-sm text-muted">Open the KaiseHo bot in Telegram and send your link code. Urgent alerts arrive instantly with <b>Acknowledge</b> and <b>Call Amma now</b> buttons.</p>
          <ul className="mt-4 space-y-2">
            {(ov?.members ?? []).filter((m) => m.linkCode).map((m) => (
              <li key={m.memberId} className="flex items-center justify-between gap-2 rounded-2xl bg-cream/70 px-4 py-3 ring-1 ring-sand">
                <span><b>{m.name}</b> <span className="text-sm text-muted">({m.relation})</span></span>
                {m.telegramLinked ? <Badge tone="forest"><Check className="size-3" />linked</Badge> : <code className="rounded-lg bg-paper px-2 py-1 text-xs ring-1 ring-sand-deep">/start {m.linkCode}</code>}
              </li>
            ))}
          </ul>
          {!integ?.telegram && <p className="mt-3 text-xs text-muted">Bot not configured on the server yet (set TELEGRAM_BOT_TOKEN).</p>}
        </Card>
        <Card>
          <CardHeader icon={Phone} kicker="Door 1 · for Amma" title="The voice agent" />
          <p className="text-sm text-muted">ElevenLabs agent <b>kaiseho-caller</b> connects to our MCP server and rings Amma's phone. Any phone works: no app, no internet.</p>
          <p className="mt-4 mb-1 text-xs font-bold uppercase tracking-wider text-muted">Agent MCP URL</p>
          <CopyBox value={`${API}/mcp/agent`} />
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone={integ?.elevenlabs ? "forest" : "saffron"}>{integ?.elevenlabs ? "Phone calls live" : "Simulated calls (no keys yet)"}</Badge>
            <Badge tone={integ?.briefing ? "forest" : "neutral"}>Briefing agent {integ?.briefing ? "✓" : "simulated"}</Badge>
            <Badge tone="navy">Insights: {integ?.llm}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
