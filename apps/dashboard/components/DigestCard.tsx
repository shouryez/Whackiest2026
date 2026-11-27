"use client";
import { Headphones, Loader2, Pause, Play, RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API, TOKEN, post } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader } from "./ui";

interface Digest { digestId: string; weekStart: string; weekEnd: string; script: string; audio?: { file: string }; source: string; createdAt: string; sentVia: string[] }

/** Weekly audio digest (P1-8): ElevenLabs MP3 when configured, browser voice preview otherwise. */
export function DigestCard({ elderId, name }: { elderId: string; name: string }) {
  const { data, reload } = useApi<Digest[]>(`/elders/${elderId}/digests`);
  const { bump } = useLive();
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const d = data?.[0];
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  const speak = () => {
    if (!d) return;
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(d.script);
    u.lang = "en-IN"; u.rate = 0.98;
    const v = synth.getVoices().find((x) => x.lang === "en-IN") ?? synth.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    synth.speak(u); setSpeaking(true);
  };

  return (
    <Card>
      <CardHeader icon={Headphones} tone="navy" kicker="Every Sunday, 8 PM" title={`This week with ${name}`}
        action={<Button size="sm" variant="secondary" icon={busy ? Loader2 : RefreshCw} disabled={busy}
          onClick={async () => { setBusy(true); try { await post(`/elders/${elderId}/digest`); reload(); bump(); } finally { setBusy(false); } }}>
          {busy ? "Writing…" : d ? "Regenerate" : "Make this week's digest"}
        </Button>} />
      {!d ? (
        <p className="text-sm text-muted">A 60-second audio summary of {name}'s week, ending with one thing to talk about. Sent to your Telegram every Sunday.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-navy to-navy/75 p-4 text-on-forest">
            {d.audio ? (
              <audio ref={audio} controls preload="none" className="h-10 w-full min-w-0 flex-1" src={`${API}/media/digests/${d.audio.file}?token=${encodeURIComponent(TOKEN)}`} />
            ) : (
              <>
                <button onClick={speak} className="grid size-12 shrink-0 place-items-center rounded-full bg-saffron text-ink shadow-lg transition hover:scale-105" aria-label={speaking ? "Stop" : "Play"}>
                  {speaking ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
                </button>
                <div className="flex h-8 flex-1 items-center gap-[3px]">
                  {Array.from({ length: 48 }).map((_, i) => (
                    <span key={i} className={speaking ? "wave-bar w-1 rounded-full bg-on-forest/80" : "w-1 rounded-full bg-on-forest/35"}
                      style={{ height: `${25 + ((i * 53) % 75)}%`, animationDelay: `${(i % 8) * 0.09}s` }} />
                  ))}
                </div>
                <span className="flex items-center gap-1 text-[11px] text-on-forest/70"><Volume2 className="size-3.5" />browser voice</span>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="navy">{d.weekStart.slice(5)} → {d.weekEnd.slice(5)}</Badge>
            <Badge tone={d.audio ? "forest" : "saffron"}>{d.audio ? "ElevenLabs voice" : "Audio needs ElevenLabs key"}</Badge>
            <Badge>{d.source === "llm" ? "AI-written" : "Rules-written"}</Badge>
            {d.sentVia.filter((s) => s.startsWith("telegram")).map((s) => <Badge key={s} tone="forest">✓ {s.replace("telegram:", "Telegram → ")}</Badge>)}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-forest">Read the script</summary>
            <p className="mt-2 leading-relaxed text-ink/80">{d.script}</p>
          </details>
        </>
      )}
    </Card>
  );
}
