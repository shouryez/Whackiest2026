"use client";
import { Bell, FileText, LayoutDashboard, Lock, Menu, Moon, Plug, Radio, ShieldAlert, Sun, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, post, type Alert, type Integrations } from "@/lib/api";
import { useApi, useLive } from "@/lib/live";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Today's edition", icon: LayoutDashboard },
  { href: "/live", label: "Live Ops", icon: Radio },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/privacy", label: "Privacy & trust", icon: Lock },
  { href: "/audit", label: "Audit log", icon: FileText },
  { href: "/connect", label: "Connect", icon: Plug },
];

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="KaiseHo home">
      <span className="relative grid size-9 place-items-center">
        <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="none" stroke="var(--k-saffron)" strokeWidth="1.4" strokeDasharray="2 3.2" className="origin-center transition-transform duration-700 group-hover:rotate-90" />
          <circle cx="20" cy="20" r="12.5" fill="var(--k-forest)" />
          <path d="M14 21.5c2.2 3.6 9.8 3.6 12 0" stroke="var(--k-on-forest)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="16.2" cy="17" r="1.4" fill="var(--k-on-forest)" /><circle cx="23.8" cy="17" r="1.4" fill="var(--k-on-forest)" />
        </svg>
        <span className="absolute -right-0.5 bottom-0.5 size-2.5 rounded-full bg-saffron ring-2 ring-cream" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[1.45rem] font-medium tracking-tight">Kaise<span className="k-wonk text-saffron-deep">Ho</span></span>
          <span className="text-[9.5px] font-semibold tracking-[0.24em] text-muted uppercase">by Ek Call</span>
        </span>
      )}
    </Link>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("k-theme", next); } catch { /* private mode: theme still switches for this visit */ }
    setDark(!dark);
  };
  return (
    <button onClick={flip} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-8 w-[58px] items-center rounded-full bg-sand/70 p-1 ring-1 ring-sand-deep transition hover:ring-ink/30">
      <span className={cx("grid size-6 place-items-center rounded-full bg-paper shadow transition-transform duration-500", dark && "translate-x-[26px]")}>
        {dark ? <Moon className="size-3.5 text-saffron" /> : <Sun className="size-3.5 text-saffron-deep" />}
      </span>
    </button>
  );
}

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data: alerts } = useApi<Alert[]>("/alerts");
  const open = (alerts ?? []).filter((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency")).length;
  const { data: elders } = useApi<{ elderId: string; name: string; preferredName: string; status: string }[]>("/elders");
  const item = (active: boolean) => cx("group flex items-center gap-3 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition", active ? "bg-ink text-cream" : "text-muted hover:bg-sand/60 hover:text-ink");
  return (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-7 px-1.5 pt-1"><Wordmark /></div>
      <Link href="/" onClick={onNavigate} className={item(path === "/")}><LayoutDashboard className="size-[17px]" strokeWidth={1.9} /><span className="flex-1">{NAV[0].label}</span></Link>
      <p className="mt-5 mb-1.5 px-3.5 text-[10px] font-semibold tracking-[0.22em] text-muted/70 uppercase">The family</p>
      {(elders ?? []).map((e) => {
        const href = `/elder/${e.elderId}`;
        const active = path.startsWith(href);
        return (
          <Link key={e.elderId} href={href} onClick={onNavigate} className={item(active)}>
            <span className={cx("k-wonk grid size-[22px] place-items-center rounded-full font-display text-[12px]", active ? "bg-saffron text-[#1d140a]" : "bg-[radial-gradient(circle_at_30%_25%,#f6b467,#c4501f_70%)] text-[#fff8ee]")}>{e.name[0]}</span>
            <span className="flex-1 truncate">{e.name} <span className="opacity-70">{e.preferredName}</span></span>
            {e.status === "pending_consent" && <span className="rounded-full bg-saffron-soft px-1.5 py-0.5 text-[9px] font-bold text-saffron-deep">CONSENT</span>}
          </Link>
        );
      })}
      <Link href="/onboard" onClick={onNavigate} className={cx(item(path === "/onboard"), path !== "/onboard" && "text-forest")}><UserPlus className="size-[17px]" strokeWidth={1.9} /><span>Add a parent</span></Link>
      <p className="mt-5 mb-1.5 px-3.5 text-[10px] font-semibold tracking-[0.22em] text-muted/70 uppercase">Behind the scenes</p>
      {NAV.slice(1).map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} className={item(active)}>
            <Icon className="size-[17px]" strokeWidth={1.9} />
            <span className="flex-1">{label}</span>
            {label === "Alerts" && open > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[10.5px] font-bold text-on-forest">{open}</span>}
            {label === "Live Ops" && <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-forest opacity-60" /><span className="relative size-2 rounded-full bg-forest" /></span>}
          </Link>
        );
      })}
      <div className="mt-auto rounded-[18px] border border-sand bg-paper p-4">
        <p className="font-hand text-[1.35rem] leading-tight text-saffron-deep">One call a day.</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">KaiseHo never calls Amma instead of you. It tells you when to call, and what to ask.</p>
      </div>
    </nav>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1", ok ? "text-forest ring-forest/25" : "text-muted ring-sand-deep")}>
      <span className={cx("size-1.5 rounded-full", ok ? "bg-forest" : "bg-sand-deep")} />{label}
    </span>
  );
}

function UrgentBanner() {
  const { data: alerts, reload } = useApi<Alert[]>("/alerts");
  const urgent = (alerts ?? []).find((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency"));
  const path = usePathname();
  if (!urgent || path === "/live") return null;
  return (
    <div className="animate-slide-in mb-6 flex flex-wrap items-center gap-3 rounded-[18px] border border-danger/40 bg-danger px-4 py-3 text-on-forest shadow-[var(--shadow-lift)]">
      <span className="grid size-8 place-items-center rounded-full bg-on-forest/15"><ShieldAlert className="size-4.5" /></span>
      <p className="flex-1 text-sm"><b className="font-display text-[15px] font-medium tracking-wide">{urgent.severity === "emergency" ? "EMERGENCY" : "URGENT"} · {urgent.title}.</b> <span className="opacity-90">{urgent.body.slice(0, 120)}{urgent.body.length > 120 ? "…" : ""}</span></p>
      <button onClick={async () => { await post(`/alerts/${urgent.alertId}/ack`); reload(); }} className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-bold text-danger hover:bg-paper/90">✓ Acknowledge</button>
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
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (path === "/live") return <>{children}</>; // projector view is full-bleed

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-sand bg-paper-2/60 backdrop-blur-sm lg:block"><Rail /></aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-paper shadow-xl"><Rail onNavigate={() => setMenu(false)} /></aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-sand bg-cream/80 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setMenu(!menu)} className="rounded-full p-2 hover:bg-sand/50 lg:hidden" aria-label="Menu">{menu ? <X className="size-5" /> : <Menu className="size-5" />}</button>
              <span className="lg:hidden"><Wordmark compact /></span>
              <p className="hidden text-[12.5px] text-muted sm:block"><span className="font-display text-ink italic">{today}</span><span className="mx-2 text-sand-deep">|</span>Lakshmi Amma&apos;s family · <span className="font-semibold text-ink">Ravi</span></p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden items-center gap-1.5 md:flex">
                <Pill ok={online} label={online ? "Live" : "Offline"} />
                <Pill ok={Boolean(integ?.elevenlabs)} label={integ?.elevenlabs ? "Phone calls" : "Simulated"} />
                <Pill ok={Boolean(integ?.telegram)} label="Telegram" />
                <Pill ok={integ?.llm !== "rules"} label={integ?.llm && integ.llm !== "rules" ? `AI · ${integ.llm}` : "Rules AI"} />
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1300px] px-4 py-7 sm:px-8 sm:py-9">
          <UrgentBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
