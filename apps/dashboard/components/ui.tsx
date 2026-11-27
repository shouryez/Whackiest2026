"use client";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Paper card with a hairline border. Tones: paper, saffron (lamp-lit), forest (ink green), danger, night. */
export function Card({ children, className, tone = "paper", crown }: { children: ReactNode; className?: string; tone?: "paper" | "saffron" | "forest" | "danger" | "night"; crown?: boolean }) {
  const tones = {
    paper: "bg-paper border-sand",
    saffron: "bg-[linear-gradient(160deg,var(--k-saffron-soft),var(--k-surface)_70%)] border-saffron/35",
    forest: "bg-[linear-gradient(160deg,var(--k-forest),var(--k-forest-deep))] border-forest-deep text-on-forest",
    danger: "bg-danger-soft border-danger/35",
    night: "bg-night border-night-3 text-[#e8eaf6]",
  };
  return (
    <section className={cx("relative overflow-hidden rounded-[22px] border p-5 shadow-[var(--shadow-card)] sm:p-6", tones[tone], className)}>
      {crown && <div className="k-textile absolute inset-x-0 top-0" aria-hidden />}
      {children}
    </section>
  );
}

export function CardHeader({ icon: Icon, title, kicker, action, tone = "forest", folio }: { icon?: LucideIcon; title: ReactNode; kicker?: ReactNode; action?: ReactNode; tone?: "forest" | "saffron" | "danger" | "navy" | "teal" | "light"; folio?: string }) {
  const iconTone = { forest: "bg-forest-soft text-forest", saffron: "bg-saffron-soft text-saffron-deep", danger: "bg-danger-soft text-danger", navy: "bg-navy-soft text-navy", teal: "bg-teal-soft text-teal", light: "bg-on-forest/15 text-on-forest" }[tone];
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", iconTone)}><Icon className="size-[18px]" strokeWidth={2} /></span>}
        <div className="min-w-0">
          {kicker && <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] opacity-60">{folio && <span className="font-display text-[12px] tracking-normal normal-case opacity-90">№ {folio}</span>}{kicker}</p>}
          <h2 className="font-display text-[1.32rem] leading-tight font-medium tracking-tight">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "forest" | "saffron" | "danger" | "navy" | "teal" | "t0" | "t1" | "t2" | "t3";
const BADGE: Record<Tone, string> = {
  neutral: "bg-sand/55 text-muted",
  forest: "bg-forest-soft text-forest",
  saffron: "bg-saffron-soft text-saffron-deep",
  danger: "bg-danger-soft text-danger",
  navy: "bg-navy-soft text-navy",
  teal: "bg-teal-soft text-teal",
  t0: "bg-t0/15 text-muted",
  t1: "bg-t1/12 text-t1",
  t2: "bg-t2/12 text-t2",
  t3: "bg-t3/12 text-t3",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", BADGE[tone], className)}>{children}</span>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "saffron" | "danger" | "light";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-forest text-on-forest hover:bg-forest-deep shadow-[0_6px_18px_-8px_var(--k-forest)]",
  secondary: "bg-paper text-ink ring-1 ring-sand-deep hover:ring-ink/40 hover:bg-paper-2",
  ghost: "text-muted hover:bg-sand/50 hover:text-ink",
  saffron: "bg-saffron text-[#1d140a] hover:brightness-105 shadow-[0_6px_18px_-8px_var(--k-saffron)]",
  danger: "bg-paper text-danger ring-1 ring-danger/40 hover:bg-danger-soft",
  light: "bg-on-forest/10 text-on-forest ring-1 ring-on-forest/20 hover:bg-on-forest/20",
};
export function Button({ variant = "primary", icon: Icon, children, className, href, size = "md", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; href?: string; size?: "sm" | "md" | "lg" }) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron",
    size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm",
    BTN[variant], className,
  );
  const inner = <>{Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.2} />}{children}</>;
  if (href) return href.startsWith("/") || href.startsWith("#") ? <Link href={href} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
  return <button className={cls} {...rest}>{inner}</button>;
}

/** Portrait monogram with a status ring; the ring pulses during a live call. */
export function Avatar({ name, ring = "grey", size = 64, pulse }: { name: string; ring?: "green" | "amber" | "red" | "grey"; size?: number; pulse?: boolean }) {
  const ringColor = { green: "var(--k-forest)", amber: "var(--k-saffron)", red: "var(--k-danger)", grey: "var(--k-line-strong)" }[ring];
  return (
    <span className={cx("relative inline-grid shrink-0 place-items-center rounded-full", pulse && "animate-ring")} style={{ width: size, height: size, boxShadow: `0 0 0 2px var(--k-surface), 0 0 0 ${size > 40 ? 4 : 3}px ${ringColor}` }}>
      <span className="k-wonk grid size-full place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#f6b467,#c4501f_70%)] font-display font-semibold text-[#fff8ee]" style={{ fontSize: size * 0.42 }}>
        {name.slice(0, 1)}
      </span>
    </span>
  );
}

/** Numbers that count up when they first appear or change. */
export function CountUp({ value, duration = 900, decimals = 0, className }: { value: number; duration?: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={cx("tabular", className)}>{shown.toFixed(decimals)}</span>;
}

export function Stat({ label, value, sub, tone = "ink" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ink" | "forest" | "saffron" | "danger" }) {
  const c = { ink: "text-ink", forest: "text-forest", saffron: "text-saffron-deep", danger: "text-danger" }[tone];
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-[2rem] leading-none font-medium tabular", c)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** A handwritten quote: something she actually said. */
export function HandNote({ children, by, className }: { children: ReactNode; by?: string; className?: string }) {
  return (
    <figure className={cx("relative", className)}>
      <blockquote className="font-hand text-[1.55rem] leading-snug text-saffron-deep">“{children}”</blockquote>
      {by && <figcaption className="mt-1 text-xs font-semibold tracking-wide text-muted">— {by}</figcaption>}
    </figure>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-sand-deep px-6 py-10 text-center">
      <Icon className="size-8 text-sand-deep" />
      <p className="mt-3 font-display text-lg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[22px] bg-sand/50", className)} />;
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {kicker && <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-deep">{kicker}</p>}
          <h1 className="mt-1 font-display text-[2.4rem] leading-[1.05] font-medium tracking-tight sm:text-[3rem]">{title}</h1>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      <div className="k-textile mt-5 rounded-full" aria-hidden />
    </div>
  );
}

/** Editorial section divider: "02 · Health" with a double rule. */
export function SectionHead({ n, title, sub, id, action }: { n: string; title: string; sub?: string; id?: string; action?: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="k-wonk font-display text-sm text-saffron-deep tabular">{n}</span>
          <h2 className="font-display text-[1.75rem] leading-none font-medium tracking-tight">{title}</h2>
          {sub && <span className="hidden text-sm text-muted sm:inline">{sub}</span>}
        </div>
        {action}
      </div>
      <hr className="k-rule mt-3 mb-5" />
    </div>
  );
}
