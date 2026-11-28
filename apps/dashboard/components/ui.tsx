"use client";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Glass card with a hairline border and a pointer spotlight. Tones keep their old names. */
export function Card({ children, className, tone = "paper", crown, glow }: { children: ReactNode; className?: string; tone?: "paper" | "saffron" | "forest" | "danger" | "night"; crown?: boolean; glow?: boolean }) {
  const tones = {
    paper: "k-glass",
    saffron: "k-glass bg-[linear-gradient(160deg,var(--k-saffron-soft),transparent_70%)] border-saffron/30",
    forest: "border-violet/30 bg-[linear-gradient(150deg,#1e1b4b,#2a1f5c_55%,#3b1d4a)] text-[#f3f0ff] [--k-on-forest:#f3f0ff] [--k-muted:#b9b5dc]",
    danger: "k-glass bg-[linear-gradient(160deg,var(--k-danger-soft),transparent_70%)] border-danger/35",
    night: "bg-night border-night-3 text-[#ece9ff]",
  };
  return (
    <section className={cx("k-spot relative overflow-hidden rounded-[24px] border p-5 sm:p-6", tones[tone], glow && "k-ring", className)}>
      {crown && <div className="k-textile absolute inset-x-6 top-0" aria-hidden />}
      {children}
    </section>
  );
}

export function CardHeader({ icon: Icon, title, kicker, action, tone = "forest", folio }: { icon?: LucideIcon; title: ReactNode; kicker?: ReactNode; action?: ReactNode; tone?: "forest" | "saffron" | "danger" | "navy" | "teal" | "light" | "rose"; folio?: string }) {
  const iconTone = {
    forest: "bg-forest-soft text-forest ring-forest/20", saffron: "bg-saffron-soft text-saffron ring-saffron/25", danger: "bg-danger-soft text-danger ring-danger/20",
    navy: "bg-navy-soft text-navy ring-navy/20", teal: "bg-teal-soft text-teal ring-teal/20", light: "bg-ink/10 text-ink ring-ink/10", rose: "bg-rose-soft text-rose ring-rose/20",
  }[tone];
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl ring-1", iconTone)}><Icon className="size-[17px]" strokeWidth={2} /></span>}
        <div className="min-w-0">
          {kicker && <p className="k-label flex items-center gap-2 text-muted">{folio && <span className="text-saffron">{folio}</span>}{kicker}</p>}
          <h2 className="font-display text-[1.18rem] leading-tight font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "forest" | "saffron" | "danger" | "navy" | "teal" | "rose" | "t0" | "t1" | "t2" | "t3";
const BADGE: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-muted ring-ink/10",
  forest: "bg-forest-soft text-forest ring-forest/20",
  saffron: "bg-saffron-soft text-saffron-deep ring-saffron/25",
  danger: "bg-danger-soft text-danger ring-danger/25",
  navy: "bg-navy-soft text-navy ring-navy/20",
  teal: "bg-teal-soft text-teal ring-teal/20",
  rose: "bg-rose-soft text-rose ring-rose/20",
  t0: "bg-t0/15 text-muted ring-t0/20",
  t1: "bg-t1/12 text-t1 ring-t1/25",
  t2: "bg-t2/12 text-t2 ring-t2/25",
  t3: "bg-t3/12 text-t3 ring-t3/25",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset", BADGE[tone], className)}>{children}</span>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "saffron" | "danger" | "light";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-[linear-gradient(135deg,#ffc56e,var(--k-saffron)_45%,#ff8f5a)] text-on-saffron shadow-[0_10px_30px_-12px_var(--k-saffron),inset_0_1px_0_rgba(255,255,255,.5)] hover:brightness-105 hover:shadow-[0_14px_40px_-12px_var(--k-saffron),inset_0_1px_0_rgba(255,255,255,.5)]",
  saffron: "bg-[linear-gradient(135deg,#ffc56e,var(--k-saffron)_45%,#ff8f5a)] text-on-saffron shadow-[0_10px_30px_-12px_var(--k-saffron)] hover:brightness-105",
  secondary: "bg-ink/[0.05] text-ink ring-1 ring-inset ring-sand-deep backdrop-blur hover:bg-ink/[0.09] hover:ring-ink/25",
  ghost: "text-muted hover:bg-ink/[0.06] hover:text-ink",
  danger: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/20",
  light: "bg-ink/10 text-ink ring-1 ring-inset ring-ink/15 hover:bg-ink/15",
};
export function Button({ variant = "primary", icon: Icon, children, className, href, size = "md", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: LucideIcon; href?: string; size?: "sm" | "md" | "lg" }) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron",
    size === "sm" ? "h-8 px-3.5 text-xs" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4.5 text-[13.5px]",
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
    <span className={cx("relative inline-grid shrink-0 place-items-center rounded-full", pulse && "animate-ring")} style={{ width: size, height: size, boxShadow: `0 0 0 2px var(--k-bg), 0 0 0 ${size > 40 ? 4 : 3}px ${ringColor}` }}>
      <span className="grid size-full place-items-center rounded-full bg-[conic-gradient(from_210deg,#ffc56e,#ff8f5a,#ff6b8b,#a993ff,#ffc56e)] font-serif text-[#1a1005] italic" style={{ fontSize: size * 0.48 }}>
        <span className="grid size-[calc(100%-3px)] place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#ffd9a0,#ffad4a_55%,#f07a3a)]">{name.slice(0, 1)}</span>
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
  const c = { ink: "text-ink", forest: "text-forest", saffron: "text-saffron", danger: "text-danger" }[tone];
  return (
    <div>
      <p className="k-label text-muted">{label}</p>
      <p className={cx("mt-1.5 font-display text-[2rem] leading-none font-semibold tracking-tight tabular", c)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Her own words, in serif italic. */
export function HandNote({ children, by, className }: { children: ReactNode; by?: string; className?: string }) {
  return (
    <figure className={cx("relative", className)}>
      <blockquote className="font-serif text-[1.45rem] leading-snug text-ink italic"><span className="text-saffron">“</span>{children}<span className="text-saffron">”</span></blockquote>
      {by && <figcaption className="k-label mt-2 text-muted">{by}</figcaption>}
    </figure>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-sand-deep px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-ink/[0.05] ring-1 ring-sand"><Icon className="size-6 text-muted" /></span>
      <p className="mt-3 font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("k-shimmer rounded-[24px] bg-ink/[0.04] ring-1 ring-sand", className)} />;
}

/** Page header for app pages: mono kicker, big grotesk title, actions on the right. */
export function PageTitle({ kicker, title, children, sub }: { kicker?: string; title: ReactNode; children?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="animate-fade-up mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker && <p className="k-label flex items-center gap-2 text-saffron"><span className="size-1.5 rounded-full bg-saffron shadow-[0_0_10px_var(--k-saffron)]" />{kicker}</p>}
          <h1 className="mt-2 font-display text-[2.1rem] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[2.75rem]">{title}</h1>
          {sub && <p className="mt-2 max-w-2xl text-[14.5px] text-muted">{sub}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

/** Section divider inside a page. */
export function SectionHead({ n, title, sub, id, action }: { n: string; title: string; sub?: string; id?: string; action?: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="k-label text-saffron tabular">{n}</span>
          <h2 className="font-display text-[1.45rem] leading-none font-semibold tracking-tight">{title}</h2>
          {sub && <span className="hidden text-sm text-muted sm:inline">{sub}</span>}
        </div>
        {action}
      </div>
      <hr className="k-rule mt-3 mb-5" />
    </div>
  );
}

/** Small tile for bento grids: label, big value, footnote. */
export function Tile({ label, value, foot, icon: Icon, tone = "saffron", className, children }: { label: string; value?: ReactNode; foot?: ReactNode; icon?: LucideIcon; tone?: "saffron" | "forest" | "rose" | "navy" | "teal" | "danger"; className?: string; children?: ReactNode }) {
  const t = { saffron: "text-saffron", forest: "text-forest", rose: "text-rose", navy: "text-navy", teal: "text-teal", danger: "text-danger" }[tone];
  return (
    <section className={cx("k-glass k-spot relative overflow-hidden rounded-[22px] border p-4.5", className)}>
      <div className="flex items-center justify-between">
        <p className="k-label text-muted">{label}</p>
        {Icon && <Icon className={cx("size-4", t)} strokeWidth={2} />}
      </div>
      {value !== undefined && <p className="mt-3 font-display text-[1.9rem] leading-none font-semibold tracking-tight tabular">{value}</p>}
      {children}
      {foot && <p className="mt-2 text-[12px] text-muted">{foot}</p>}
    </section>
  );
}
