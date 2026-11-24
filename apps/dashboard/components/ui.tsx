"use client";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "saffron" | "forest" | "danger" | "night" }) {
  const tones = {
    paper: "bg-paper border-sand",
    saffron: "bg-gradient-to-br from-saffron-soft to-paper border-saffron/50",
    forest: "bg-gradient-to-br from-forest to-forest-deep border-forest-deep text-white",
    danger: "bg-danger-soft border-danger/40",
    night: "bg-night border-night-3 text-[#e8eaf6]",
  };
  return <section className={cx("rounded-3xl border p-5 shadow-[var(--shadow-card)] sm:p-6", tones[tone], className)}>{children}</section>;
}

export function CardHeader({ icon: Icon, title, kicker, action, tone = "forest" }: { icon?: LucideIcon; title: ReactNode; kicker?: ReactNode; action?: ReactNode; tone?: "forest" | "saffron" | "danger" | "navy" | "light" }) {
  const iconTone = { forest: "bg-forest-soft text-forest", saffron: "bg-saffron-soft text-saffron-deep", danger: "bg-danger-soft text-danger", navy: "bg-[#e9ebfb] text-navy", light: "bg-white/15 text-white" }[tone];
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && <span className={cx("grid size-10 shrink-0 place-items-center rounded-2xl", iconTone)}><Icon className="size-5" strokeWidth={2.2} /></span>}
        <div>
          {kicker && <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-60">{kicker}</p>}
          <h2 className="text-lg leading-tight font-bold">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "forest" | "saffron" | "danger" | "navy" | "t0" | "t1" | "t2" | "t3";
const BADGE: Record<Tone, string> = {
  neutral: "bg-sand/60 text-muted",
  forest: "bg-forest-soft text-forest",
  saffron: "bg-saffron-soft text-saffron-deep",
  danger: "bg-danger-soft text-danger",
  navy: "bg-[#e9ebfb] text-navy",
  t0: "bg-t0/15 text-[#555b66]",
  t1: "bg-t1/12 text-t1",
  t2: "bg-t2/12 text-t2",
  t3: "bg-t3/12 text-t3",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", BADGE[tone], className)}>{children}</span>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "saffron" | "danger" | "light";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-forest text-white hover:bg-forest-deep shadow-sm",
  secondary: "bg-paper text-forest ring-1 ring-sand-deep hover:bg-forest-soft",
  ghost: "text-muted hover:bg-sand/50 hover:text-ink",
  saffron: "bg-saffron text-ink hover:bg-[#f08c22] shadow-sm",
  danger: "bg-paper text-danger ring-1 ring-danger/40 hover:bg-danger-soft",
  light: "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20",
};
export function Button({ variant = "primary", icon: Icon, children, className, href, size = "md", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; href?: string; size?: "sm" | "md" | "lg" }) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron",
    size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm",
    BTN[variant], className,
  );
  const inner = <>{Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.3} />}{children}</>;
  if (href) return href.startsWith("/") ? <Link href={href} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
  return <button className={cls} {...rest}>{inner}</button>;
}

export function Avatar({ name, ring = "grey", size = 64, pulse }: { name: string; ring?: "green" | "amber" | "red" | "grey"; size?: number; pulse?: boolean }) {
  const ringColor = { green: "#2e9e5b", amber: "#fd9b36", red: "#c62828", grey: "#c9bfa9" }[ring];
  return (
    <span className={cx("relative inline-grid shrink-0 place-items-center rounded-full", pulse && "animate-ring")} style={{ width: size, height: size, boxShadow: `0 0 0 3px ${ringColor}` }}>
      <span className="grid size-full place-items-center rounded-full border-4 border-paper bg-gradient-to-br from-saffron to-rust font-display font-bold text-white" style={{ fontSize: size * 0.38 }}>
        {name.slice(0, 1)}
      </span>
    </span>
  );
}

export function Stat({ label, value, sub, tone = "ink" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ink" | "forest" | "saffron" | "danger" }) {
  const c = { ink: "text-ink", forest: "text-forest", saffron: "text-saffron-deep", danger: "text-danger" }[tone];
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-3xl leading-none font-semibold", c)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-sand-deep px-6 py-10 text-center">
      <Icon className="size-8 text-sand-deep" />
      <p className="mt-3 font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-sand/50", className)} />;
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="text-xs font-bold uppercase tracking-[0.16em] text-saffron-deep">{kicker}</p>}
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
