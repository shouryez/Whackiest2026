"use client";
import Lenis from "lenis";
import { AnimatePresence, motion, useInView, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";

/** Buttery scrolling for the landing page only. */
export function useLenis() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    // In-page anchors scroll smoothly too.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const el = document.querySelector(a.getAttribute("href")!);
      if (el) { e.preventDefault(); lenis.scrollTo(el as HTMLElement, { offset: -70 }); }
    };
    document.addEventListener("click", onClick);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); document.removeEventListener("click", onClick); };
  }, []);
}

/** Fade + rise + un-blur when scrolled into view. */
export function Reveal({ children, delay = 0, y = 28, className, once = true }: { children: ReactNode; delay?: number; y?: number; className?: string; once?: boolean }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y, filter: "blur(8px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-10% 0px -10% 0px" }} transition={{ duration: 0.9, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

/** A sentence whose words light up one by one as you scroll through it. */
export function ScrollWords({ text, className, accent = [] }: { text: string; className?: string; accent?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 45%"] });
  const words = text.split(" ");
  return (
    <div ref={ref} className={className}>
      {words.map((w, i) => <Word key={i} w={w} p={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} hot={accent.some((a) => w.toLowerCase().includes(a))} />)}
    </div>
  );
}
function Word({ w, p, range, hot }: { w: string; p: MotionValue<number>; range: [number, number]; hot: boolean }) {
  const opacity = useTransform(p, range, [0.13, 1]);
  const y = useTransform(p, range, [6, 0]);
  return <motion.span style={{ opacity, y }} className={cx("mr-[0.26em] inline-block", hot && "k-grad-text font-serif font-normal italic")}>{w}</motion.span>;
}

/** Counts up once when visible. */
export function Counter({ to, prefix = "", suffix = "", decimals = 0, duration = 1.8 }: { to: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / (duration * 1000));
      setV(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  return <span ref={ref} className="tabular">{prefix}{v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/** Endless horizontal band. */
export function Marquee({ items, className, reverse }: { items: ReactNode[]; className?: string; reverse?: boolean }) {
  return (
    <div className={cx("relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]", className)}>
      <div className={cx("animate-marquee flex shrink-0 items-center gap-10 pr-10", reverse && "[animation-direction:reverse]")}>
        {[...items, ...items].map((it, i) => <span key={i} className="flex shrink-0 items-center gap-10">{it}<span className="text-saffron">✦</span></span>)}
      </div>
    </div>
  );
}

/** Cycles words with a blur-slide (Amma? → अम्मा? → Appa? …). */
export function CyclingWord({ words, every = 2200, className }: { words: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % words.length), every); return () => clearInterval(id); }, [words.length, every]);
  return (
    <span className={cx("relative inline-grid", className)}>
      <span className="invisible col-start-1 row-start-1">{words.reduce((a, b) => (b.length > a.length ? b : a), "")}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={i} className="col-start-1 row-start-1" initial={{ y: "45%", opacity: 0, filter: "blur(10px)" }} animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }} exit={{ y: "-45%", opacity: 0, filter: "blur(10px)" }} transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}>
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Element that leans toward the pointer. */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  return (
    <motion.div ref={ref} style={{ x, y }} className={cx("inline-block", className)}
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

/** 3D tilt following the pointer across the whole hero. */
export function useTilt(max = 10) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [max, -max]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-max, max]), { stiffness: 120, damping: 20 });
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  return { rx, ry, mx, my, onMove, onLeave: () => { mx.set(0); my.set(0); } };
}

/** A phone frame (rounded glass slab with a notch). */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("relative aspect-[9/18.5] w-[290px] rounded-[46px] bg-[linear-gradient(150deg,#2a2850,#0b0b1f_45%,#1d1b3e)] p-[10px] shadow-[0_50px_120px_-30px_rgba(0,0,0,.85),inset_0_1px_0_rgba(255,255,255,.18),0_0_0_1px_rgba(255,255,255,.08)]", className)}>
      <div className="relative h-full overflow-hidden rounded-[37px] bg-[radial-gradient(120%_80%_at_50%_0%,#1b1946,#07071a_70%)] text-[#f3f0ff]">
        <div className="absolute top-2.5 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

/** Typewriter that reveals text when `run` is true. */
export function Typed({ text, run = true, speed = 22, className, onDone }: { text: string; run?: boolean; speed?: number; className?: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i++; setN(i); if (i >= text.length) { clearInterval(id); onDone?.(); } }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, text]);
  return <span className={className}>{text.slice(0, n)}{run && n < text.length && <span className="k-caret" />}</span>;
}
