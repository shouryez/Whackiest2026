"use client";
import {
  Bell, BookOpen, CalendarHeart, ChevronDown, Command, HeartPulse, LayoutGrid, Lock, Menu, MessageSquareText, Moon, PhoneCall,
  PhoneOutgoing, Play, Plug, Radio, ScrollText, Search, ShieldAlert, ShieldCheck, Sparkles, Sun, UserPlus, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, post, type Alert, type Integrations } from "@/lib/api";
import { useElder } from "@/lib/elder";
import { timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";
import { Avatar, cx } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; hint?: string };
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Her day", items: [
    { href: "/app", label: "Overview", icon: LayoutGrid, hint: "today at a glance" },
    { href: "/app/wellbeing", label: "Wellbeing", icon: Sparkles, hint: "mood, patterns, mind gym" },
    { href: "/app/health", label: "Health", icon: HeartPulse, hint: "medicines, readings, doctor" },
    { href: "/app/calls", label: "Calls", icon: PhoneCall, hint: "every call, style, schedule" },
  ] },
  { group: "The family", items: [
    { href: "/app/family", label: "Family", icon: Users, hint: "needs, rota, messages" },
    { href: "/app/stories", label: "Story book", icon: BookOpen, hint: "her life, in her words" },
    { href: "/app/life", label: "Life admin", icon: CalendarHeart, hint: "reminders, occasions, pension" },
    { href: "/app/alerts", label: "Alerts & safety", icon: ShieldCheck, hint: "scams, emergencies" },
  ] },
  { group: "Behind the scenes", items: [
    { href: "/live", label: "Live Ops", icon: Radio, hint: "tool calls as they happen" },
    { href: "/app/privacy", label: "Privacy & trust", icon: Lock },
    { href: "/app/audit", label: "Audit log", icon: ScrollText },
    { href: "/app/connect", label: "Connect Claude", icon: Plug, hint: "MCP for the family" },
  ] },
];

export function Wordmark({ compact, href = "/app" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="KaiseHo home">
      <span className="relative grid size-9 place-items-center">
        <span className="absolute inset-0 rounded-[12px] bg-[conic-gradient(from_200deg,#ffc56e,#ff8f5a,#ff6b8b,#a993ff,#ffc56e)] opacity-90 blur-[0.5px] transition-transform duration-700 group-hover:rotate-180" />
        <span className="absolute inset-[2px] rounded-[10px] bg-night" />
        <svg viewBox="0 0 24 24" className="relative size-5" aria-hidden>
          {[5, 9, 13, 17].map((x, i) => <rect key={x} x={x} y={[9, 5, 7, 10][i]} width="2.2" height={[6, 14, 10, 4][i]} rx="1.1" fill={i % 2 ? "#ffc56e" : "#ff8fa8"} className="wave-bar" style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1.6s" }} />)}
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[1.35rem] font-semibold tracking-[-0.04em]">Kaise<span className="k-grad-text font-serif text-[1.5rem] font-normal tracking-normal italic">Ho</span></span>
          <span className="k-label mt-0.5 block text-[8.5px] text-muted">powered by Ek Call</span>
        </span>
      )}
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(document.documentElement.dataset.theme !== "light"); }, []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; };
    // View transitions where supported: the new theme wipes in from the toggle.
    const d = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (d.startViewTransition) d.startViewTransition(apply); else apply();
    try { localStorage.setItem("k-theme", next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    <button onClick={flip} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cx("relative grid size-9 place-items-center overflow-hidden rounded-full bg-ink/[0.05] ring-1 ring-sand transition hover:bg-ink/10", className)}>
      <Sun className={cx("absolute size-4 text-saffron transition duration-500", dark ? "translate-y-6 rotate-90 opacity-0" : "translate-y-0 opacity-100")} />
      <Moon className={cx("absolute size-4 text-violet transition duration-500", dark ? "translate-y-0 opacity-100" : "-translate-y-6 -rotate-90 opacity-0")} />
    </button>
  );
}

function ElderSwitcher({ onPick }: { onPick?: () => void }) {
  const { elders, elder, setElderId } = useElder();
  const [open, setOpen] = useState(false);
  const { data: overview } = useApi<{ elders: { elder: { elderId: string; callTimeLocal: string }; ring: "green" | "amber" | "red" | "grey"; liveCall: unknown }[] }>("/family/overview");
  const card = overview?.elders.find((x) => x.elder.elderId === elder?.elderId);
  if (!elder) return <div className="k-shimmer h-[62px] rounded-2xl bg-ink/[0.04]" />;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="k-glass flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition hover:border-sand-deep">
        <Avatar name={elder.name} size={38} ring={card?.ring ?? "grey"} pulse={Boolean(card?.liveCall)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{elder.name} <span className="font-serif text-[15px] font-normal text-saffron italic">{elder.preferredName}</span></span>
          <span className="block truncate text-[11.5px] text-muted">{card?.liveCall ? "● on a call right now" : `Daily call at ${card?.elder.callTimeLocal ?? "…"}`}</span>
        </span>
        {elders.length > 1 && <ChevronDown className={cx("size-4 text-muted transition", open && "rotate-180")} />}
      </button>
      {open && elders.length > 1 && (
        <div className="k-glass animate-slide-in absolute inset-x-0 top-[calc(100%+6px)] z-20 rounded-2xl border p-1.5">
          {elders.map((e) => (
            <button key={e.elderId} onClick={() => { setElderId(e.elderId); setOpen(false); onPick?.(); }} className={cx("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] hover:bg-ink/[0.06]", e.elderId === elder.elderId && "bg-ink/[0.06]")}>
              <Avatar name={e.name} size={26} />
              <span className="flex-1 truncate">{e.name} {e.preferredName}</span>
              {e.status === "pending_consent" && <span className="k-label text-[8.5px] text-saffron">consent</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data: alerts } = useApi<Alert[]>("/alerts");
  const urgent = (alerts ?? []).filter((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency")).length;
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4 no-scrollbar">
      <div className="mb-5 px-1 pt-1"><Wordmark /></div>
      <ElderSwitcher onPick={onNavigate} />
      {NAV.map((g) => (
        <div key={g.group} className="mt-5">
          <p className="k-label mb-1.5 px-3 text-[9.5px] text-muted/70">{g.group}</p>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/app" ? path === "/app" : path.startsWith(href);
            return (
              <Link key={href} href={href} onClick={onNavigate}
                className={cx("group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition",
                  active ? "bg-ink/[0.07] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink")}>
                {active && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-saffron shadow-[0_0_12px_var(--k-saffron)]" />}
                <Icon className={cx("size-[17px] transition", active ? "text-saffron" : "group-hover:text-ink")} strokeWidth={1.9} />
                <span className="flex-1">{label}</span>
                {label === "Alerts & safety" && urgent > 0 && <span className="animate-danger rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">{urgent}</span>}
                {label === "Live Ops" && <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-forest opacity-60" /><span className="relative size-2 rounded-full bg-forest" /></span>}
              </Link>
            );
          })}
        </div>
      ))}
      <Link href="/app/onboard" onClick={onNavigate} className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-sand-deep px-3 py-2 text-[13px] font-medium text-muted transition hover:border-saffron/50 hover:text-ink">
        <UserPlus className="size-4" /> Add a parent
      </Link>
      <div className="k-ring mt-auto rounded-2xl bg-[linear-gradient(160deg,var(--k-saffron-soft),transparent)] p-4">
        <p className="font-serif text-[1.25rem] leading-tight italic">One call a day.</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">KaiseHo never replaces your call. It tells you when to call, and what to ask.</p>
      </div>
    </nav>
  );
}

type Cmd = { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void | Promise<void> };

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { elderId, n } = useElder();
  const { bump } = useLive();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cmds: Cmd[] = useMemo(() => [
    ...NAV.flatMap((g) => g.items.map((it) => ({ id: it.href, label: `Go to ${it.label}`, hint: it.hint, icon: it.icon, run: () => router.push(it.href) }))),
    { id: "call", label: `KaiseHo, call ${n} now`, hint: "real phone call", icon: PhoneOutgoing, run: async () => { await post(`/elders/${elderId}/call-now`); bump(); router.push("/live"); } },
    { id: "demo", label: "Play the demo call", hint: "simulated, no phone", icon: Play, run: async () => { await post("/demo/play-call", { scam: true, elderId }); bump(); router.push("/live"); } },
    { id: "msg", label: `Leave a message for ${n}`, hint: "she hears it in the next call", icon: MessageSquareText, run: () => router.push("/app/family#messages") },
    { id: "story", label: `Ask ${n} for a story`, hint: "story book", icon: BookOpen, run: () => router.push("/app/stories#ask") },
    { id: "theme", label: "Toggle light / dark", icon: Moon, run: () => { const d = document.documentElement; const next = d.dataset.theme === "light" ? "dark" : "light"; d.dataset.theme = next; try { localStorage.setItem("k-theme", next); } catch { /* */ } } },
    { id: "home", label: "Open the landing page", icon: Sparkles, run: () => router.push("/") },
  ], [router, elderId, n, bump]);
  const list = cmds.filter((c) => (c.label + " " + (c.hint ?? "")).toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);
  if (!open) return null;
  const run = async (c?: Cmd) => { if (!c) return; onClose(); await c.run(); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-center bg-night/50 px-4 pt-[14vh] backdrop-blur-sm" onClick={onClose}>
      <div className="k-glass animate-slide-in w-full max-w-[560px] overflow-hidden rounded-2xl border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-sand px-4">
          <Search className="size-4 text-muted" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Search pages and actions…"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } if (e.key === "Enter") void run(list[i]); if (e.key === "Escape") onClose(); }}
            className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
          <kbd className="k-label rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[9px] text-muted">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5 scrollbar-thin">
          {list.map((c, k) => (
            <li key={c.id}>
              <button onMouseEnter={() => setI(k)} onClick={() => void run(c)} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px]", k === i && "bg-ink/[0.07]")}>
                <span className={cx("grid size-8 place-items-center rounded-lg ring-1 ring-sand", k === i ? "bg-saffron-soft text-saffron" : "bg-ink/[0.04] text-muted")}><c.icon className="size-4" /></span>
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-[11.5px] text-muted">{c.hint}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

function AlertsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: alerts, reload } = useApi<Alert[]>("/alerts");
  const list = (alerts ?? []).slice().sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  const sev = { emergency: "bg-danger", urgent: "bg-danger", watch: "bg-saffron", info: "bg-violet" } as const;
  return (
    <div className={cx("fixed inset-0 z-[55] transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div className={cx("absolute inset-0 bg-night/40 backdrop-blur-[2px] transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside className={cx("k-glass absolute inset-y-2 right-2 flex w-[min(420px,calc(100vw-16px))] flex-col rounded-[22px] border transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]", open ? "translate-x-0" : "translate-x-[110%]")}>
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <div><p className="k-label text-muted">Notifications</p><p className="font-display text-lg font-semibold">What needs you</p></div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-ink/[0.07]" aria-label="Close"><X className="size-4" /></button>
        </div>
        <ul className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin">
          {list.map((a) => (
            <li key={a.alertId} className={cx("rounded-2xl border border-sand p-3.5 transition", a.status === "open" ? "bg-ink/[0.03]" : "opacity-60")}>
              <div className="flex items-start gap-3">
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", sev[a.severity], a.status === "open" && (a.severity === "urgent" || a.severity === "emergency") && "animate-danger")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug font-semibold">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{a.body}</p>
                  <p className="k-label mt-1.5 text-[9px] text-muted">{a.severity} · {timeAgo(a.createdAt)}{a.status !== "open" ? ` · handled${a.ackedBy ? ` by ${a.ackedBy.replace("family:mem_", "")}` : ""}` : ""}</p>
                </div>
                {a.status === "open" && <button onClick={async () => { await post(`/alerts/${a.alertId}/ack`); reload(); }} className="rounded-full bg-ink/[0.07] px-2.5 py-1 text-[11px] font-semibold hover:bg-forest-soft hover:text-forest">Seen</button>}
              </div>
            </li>
          ))}
          {!list.length && <li className="px-3 py-10 text-center text-sm text-muted">All quiet. Nothing needs you right now.</li>}
        </ul>
        <Link href="/app/alerts" onClick={onClose} className="border-t border-sand px-5 py-3 text-center text-[13px] font-semibold text-saffron hover:underline">Open Alerts & safety</Link>
      </aside>
    </div>
  );
}

function UrgentBanner() {
  const { data: alerts, reload } = useApi<Alert[]>("/alerts");
  const urgent = (alerts ?? []).find((a) => a.status === "open" && (a.severity === "urgent" || a.severity === "emergency"));
  if (!urgent) return null;
  return (
    <div className="animate-slide-in relative mb-6 flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-danger/40 bg-[linear-gradient(110deg,color-mix(in_oklab,var(--k-danger)_26%,transparent),color-mix(in_oklab,var(--k-rose)_10%,transparent))] px-4 py-3 backdrop-blur">
      <span className="animate-danger grid size-9 place-items-center rounded-full bg-danger text-white"><ShieldAlert className="size-4.5" /></span>
      <p className="min-w-0 flex-1 text-sm"><b className="font-display font-semibold">{urgent.severity === "emergency" ? "Emergency" : "Urgent"} · {urgent.title}.</b> <span className="text-muted">{urgent.body.slice(0, 120)}{urgent.body.length > 120 ? "…" : ""}</span></p>
      <button onClick={async () => { await post(`/alerts/${urgent.alertId}/ack`); reload(); }} className="h-8 rounded-full bg-danger px-4 text-xs font-bold text-white hover:brightness-110">🙋 I&apos;m on it</button>
      <Link href="/app/alerts" className="text-xs font-semibold text-muted hover:text-ink">Details</Link>
    </div>
  );
}

function StatusDots() {
  const { online } = useLive();
  const [integ, setInteg] = useState<Integrations | null>(null);
  useEffect(() => { api<Integrations>("/health/integrations").then(setInteg).catch(() => setInteg(null)); }, [online]);
  const dots = [
    { ok: online, label: online ? "Live" : "Server offline" },
    { ok: Boolean(integ?.elevenlabs), label: integ?.elevenlabs ? "Phone calls" : "Simulated calls" },
    { ok: Boolean(integ?.telegram), label: "Telegram" },
    { ok: Boolean(integ?.llm && integ.llm !== "rules"), label: integ?.llm && integ.llm !== "rules" ? `AI · ${integ.llm}` : "Rules AI" },
  ];
  return (
    <span className="hidden items-center gap-1 rounded-full bg-ink/[0.04] px-2.5 py-1.5 ring-1 ring-sand xl:flex">
      {dots.map((d) => (
        <span key={d.label} className="group relative flex items-center gap-1.5 px-1 text-[11px] text-muted">
          <span className={cx("size-1.5 rounded-full", d.ok ? "bg-forest shadow-[0_0_8px_var(--k-forest)]" : "bg-muted/50")} />{d.label}
        </span>
      ))}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  const { elderId, n } = useElder();
  const { bump } = useLive();
  const [calling, setCalling] = useState(false);
  const { data: alerts } = useApi<Alert[]>("/alerts");
  const open = (alerts ?? []).filter((a) => a.status === "open").length;
  const current = NAV.flatMap((g) => g.items).find((x) => (x.href === "/app" ? path === "/app" : path.startsWith(x.href)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    // Pointer spotlight for .k-spot surfaces.
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".k-spot") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointermove", onMove); };
  }, []);
  useEffect(() => { setMenu(false); }, [path]);

  const callNow = useCallback(async () => {
    setCalling(true);
    try { await post(`/elders/${elderId}/call-now`); bump(); } finally { setTimeout(() => setCalling(false), 2500); }
  }, [elderId, bump]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-sand bg-cream/40 backdrop-blur-xl lg:block"><Sidebar /></aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-night/50 backdrop-blur-sm" onClick={() => setMenu(false)} />
          <aside className="k-glass animate-slide-in absolute inset-y-0 left-0 w-[284px] border-r"><Sidebar onNavigate={() => setMenu(false)} /></aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-sand bg-cream/55 backdrop-blur-xl">
          <div className="flex h-15 items-center justify-between gap-3 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMenu(true)} className="grid size-9 place-items-center rounded-full hover:bg-ink/[0.06] lg:hidden" aria-label="Menu"><Menu className="size-5" /></button>
              <span className="lg:hidden"><Wordmark compact /></span>
              <p className="hidden min-w-0 truncate text-[13px] text-muted sm:block">
                <span className="text-ink">{n}</span><span className="mx-2 opacity-40">/</span><span className="font-medium text-ink">{current?.label ?? "KaiseHo"}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusDots />
              <button onClick={() => setPalette(true)} className="hidden h-9 items-center gap-2 rounded-full bg-ink/[0.05] pr-2 pl-3 text-[12.5px] text-muted ring-1 ring-sand transition hover:text-ink md:flex">
                <Search className="size-3.5" />Search & actions<kbd className="k-label ml-2 flex items-center gap-0.5 rounded-md bg-ink/[0.07] px-1.5 py-0.5 text-[9px]"><Command className="size-2.5" />K</kbd>
              </button>
              <button onClick={() => setDrawer(true)} className="relative grid size-9 place-items-center rounded-full bg-ink/[0.05] ring-1 ring-sand transition hover:bg-ink/10" aria-label="Notifications">
                <Bell className="size-4" />
                {open > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-rose px-1 text-[9.5px] font-bold text-white ring-2 ring-cream">{open}</span>}
              </button>
              <ThemeToggle />
              <button onClick={callNow} disabled={calling} className="hidden h-9 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffc56e,var(--k-saffron)_45%,#ff8f5a)] px-4 text-[13px] font-semibold text-on-saffron shadow-[0_8px_24px_-10px_var(--k-saffron)] transition hover:brightness-105 disabled:opacity-60 sm:flex">
                <PhoneOutgoing className="size-4" />{calling ? "Ringing…" : `Call ${n}`}
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1360px] px-4 py-7 sm:px-7 sm:py-8">
          <UrgentBanner />
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <AlertsDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
