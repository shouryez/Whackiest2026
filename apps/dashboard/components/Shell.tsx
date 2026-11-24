"use client";
import { Bell, FileText, LayoutDashboard, Lock, Menu, Plug, Radio, ShieldAlert, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, post, type Alert, type Integrations } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/live", label: "Live Ops", icon: Radio },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/privacy", label: "Privacy & trust", icon: Lock },
  { href: "/audit", label: "Audit log", icon: FileText },
  { href: "/connect", label: "Connect", icon: Plug },
];

function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-saffron to-rust shadow-sm">
        <span className="font-display text-lg font-bold text-white">K</span>
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-paper bg-[#2e9e5b]" />
      </span>
      <span className="leading-none">
        <span className={cx("block font-display text-xl font-semibold", light ? "text-white" : "text-forest")}>Kaise<span className="text-saffron">Ho</span></span>
        <span className={cx("text-[10px] font-semibold tracking-[0.18em] uppercase", light ? "text-white/50" : "text-muted")}>by Ek Call</span>
      </span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data: alerts } = useApi<Alert[]>("/alerts");
  const open = (alerts ?? []).filter((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency")).length;
  const { data: elders } = useApi<{ elderId: string; name: string; preferredName: string; status: string }[]>("/elders");
  return (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 px-2 pt-2"><Logo /></div>
      {NAV.slice(0, 1).map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onNavigate} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", path === "/" ? "bg-forest text-white shadow-sm" : "text-muted hover:bg-sand/50 hover:text-ink")}>
          <Icon className="size-[18px]" strokeWidth={2.2} /><span className="flex-1">{label}</span>
        </Link>
      ))}
      <p className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted/70">Family</p>
      {(elders ?? []).map((e) => {
        const href = `/elder/${e.elderId}`;
        const active = path.startsWith(href);
        return (
          <Link key={e.elderId} href={href} onClick={onNavigate} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-forest text-white shadow-sm" : "text-muted hover:bg-sand/50 hover:text-ink")}>
            <span className={cx("grid size-[22px] place-items-center rounded-full text-[11px] font-bold", active ? "bg-white/20" : "bg-gradient-to-br from-saffron to-rust text-white")}>{e.name[0]}</span>
            <span className="flex-1 truncate">{e.name} {e.preferredName}</span>
            {e.status === "pending_consent" && <span className="rounded-full bg-saffron-soft px-1.5 py-0.5 text-[9px] font-bold text-saffron-deep">CONSENT</span>}
          </Link>
        );
      })}
      <Link href="/onboard" onClick={onNavigate} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition", path === "/onboard" ? "bg-forest text-white" : "text-forest hover:bg-forest-soft")}>
        <UserPlus className="size-[18px]" strokeWidth={2.2} /><span>Add a parent</span>
      </Link>
      <p className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted/70">Operate</p>
      {NAV.slice(1).map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate}
            className={cx("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              active ? "bg-forest text-white shadow-sm" : "text-muted hover:bg-sand/50 hover:text-ink")}>
            <Icon className="size-[18px]" strokeWidth={2.2} />
            <span className="flex-1">{label}</span>
            {label === "Alerts" && open > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{open}</span>}
            {label === "Live Ops" && <span className={cx("size-2 rounded-full", active ? "bg-saffron" : "bg-[#2e9e5b]")} />}
          </Link>
        );
      })}
      <div className="mt-auto rounded-2xl bg-forest-soft p-4 text-xs leading-relaxed text-forest">
        <p className="font-bold">One call a day.</p>
        <p className="opacity-80">KaiseHo doesn't call Amma instead of you. It tells you when to call and what to ask.</p>
      </div>
    </nav>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", ok ? "bg-forest-soft text-forest ring-forest/15" : "bg-paper text-muted ring-sand-deep")}>
      <span className={cx("size-1.5 rounded-full", ok ? "bg-[#2e9e5b]" : "bg-sand-deep")} />{label}
    </span>
  );
}

function UrgentBanner() {
  const { data: alerts, reload } = useApi<Alert[]>("/alerts");
  const urgent = (alerts ?? []).find((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency"));
  const path = usePathname();
  if (!urgent || path === "/live") return null;
  return (
    <div className="animate-slide-in mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-danger px-4 py-3 text-white shadow-[var(--shadow-lift)]">
      <ShieldAlert className="size-5 shrink-0" />
      <p className="flex-1 text-sm"><b>{urgent.severity === "emergency" ? "EMERGENCY" : "URGENT"} · {urgent.title}.</b> <span className="opacity-90">{urgent.body.slice(0, 120)}{urgent.body.length > 120 ? "…" : ""}</span></p>
      <button onClick={async () => { await post(`/alerts/${urgent.alertId}/ack`); reload(); }} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-danger hover:bg-white/90">✓ Acknowledge</button>
      <Link href="/alerts" className="text-xs font-semibold underline-offset-2 hover:underline">Details</Link>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { online } = useLive();
  const [integ, setInteg] = useState<Integrations | null>(null);
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  useEffect(() => { api<Integrations>("/health/integrations").then(setInteg).catch(() => setInteg(null)); }, [online]);

  if (path === "/live") return <>{children}</>; // projector view is full-bleed

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-sand bg-paper/70 backdrop-blur lg:block"><Sidebar /></aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-paper shadow-xl"><Sidebar onNavigate={() => setMenu(false)} /></aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sand bg-cream/85 px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button onClick={() => setMenu(!menu)} className="rounded-lg p-2 hover:bg-sand/50" aria-label="Menu">{menu ? <X className="size-5" /> : <Menu className="size-5" />}</button>
            <Logo />
          </div>
          <p className="hidden text-sm text-muted lg:block">Lakshmi Amma's family · <span className="font-semibold text-ink">Ravi</span> (son)</p>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <StatusPill ok={online} label={online ? "Live" : "Offline"} />
            <span className="hidden sm:contents">
              <StatusPill ok={Boolean(integ?.elevenlabs)} label={integ?.elevenlabs ? "Phone calls" : "Simulated calls"} />
              <StatusPill ok={Boolean(integ?.telegram)} label="Telegram" />
              <StatusPill ok={integ?.llm !== "rules"} label={integ?.llm === "rules" ? "Rules AI" : `LLM: ${integ?.llm ?? "…"}`} />
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
          <UrgentBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
