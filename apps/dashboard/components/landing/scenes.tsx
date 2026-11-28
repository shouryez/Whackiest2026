"use client";
import { AnimatePresence, motion, useInView, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../ui";
import { PhoneFrame, Typed, useTilt } from "./fx";

// ------------------------------------------------------------------ hero phone

const CALL: { who: "agent" | "amma"; text: string; chip?: string }[] = [
  { who: "agent", text: "Namaste Amma! Nashte mein kya khaya aaj?" },
  { who: "amma", text: "Idli aur chai, beta. Neend bhi achhi aayi.", chip: "😊 Mood · good" },
  { who: "agent", text: "Wah! Metformin le li nashte ke baad?" },
  { who: "amma", text: "Haan, le li.", chip: "💊 Metformin · taken" },
  { who: "amma", text: "Ek CBI wale ka phone aaya tha… OTP maang raha tha.", chip: "🛡️ Scam blocked · family told" },
  { who: "agent", text: "Woh dhokha hai Amma. Phone kaat dijiye. Maine Ravi ko bata diya." },
  { who: "amma", text: "Gas cylinder bhi khatam ho raha hai.", chip: "🛒 Gas → Priya is on it" },
];

function useCallLoop(run: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (CALL.length + 3)), 1900);
    return () => clearInterval(id);
  }, [run]);
  return Math.min(step, CALL.length);
}

export function HeroPhone() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const step = useCallLoop(inView);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const id = setInterval(() => setSecs((s) => (s + 1) % 240), 1000); return () => clearInterval(id); }, []);
  const tilt = useTilt(9);
  const chips = CALL.slice(0, step).filter((c) => c.chip).slice(-4);
  return (
    <div ref={ref} className="relative grid place-items-center [perspective:1400px]" onPointerMove={tilt.onMove} onPointerLeave={tilt.onLeave}>
      {/* sound rings */}
      {[0, 1, 2].map((i) => <span key={i} className="animate-ripple absolute size-[420px] rounded-full border border-saffron/25" style={{ animationDelay: `${i * 0.8}s` }} />)}
      <div className="absolute size-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,181,71,.28),rgba(255,107,139,.12)_40%,transparent_70%)] blur-2xl" />
      <motion.div style={{ rotateX: tilt.rx, rotateY: tilt.ry, transformStyle: "preserve-3d" }} className="relative">
        <PhoneFrame>
          <div className="flex h-full flex-col px-4 pt-12 pb-5">
            <div className="text-center">
              <div className="relative mx-auto grid size-16 place-items-center">
                <span className="animate-ripple absolute inset-0 rounded-full bg-saffron/40" />
                <span className="relative grid size-16 place-items-center rounded-full bg-[conic-gradient(from_200deg,#ffc56e,#ff8f5a,#ff6b8b,#a993ff,#ffc56e)] font-serif text-2xl text-[#1a1005] italic">K</span>
              </div>
              <p className="mt-2.5 text-[15px] font-semibold">KaiseHo · daily check-in</p>
              <p className="font-mono text-[11px] text-[#9a96bd]">Lakshmi Amma · 0{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</p>
              <div className="mx-auto mt-2 flex h-5 w-24 items-center justify-center gap-[3px]">
                {Array.from({ length: 14 }).map((_, i) => <span key={i} className="wave-bar w-[3px] rounded-full bg-[linear-gradient(#ffc56e,#ff6b8b)]" style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 5) * 0.12}s` }} />)}
              </div>
            </div>
            <div className="mt-4 flex flex-1 flex-col justify-end gap-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {CALL.slice(Math.max(0, step - 4), step).map((c, k) => (
                  <motion.p key={`${step}-${k}-${c.text}`} layout initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
                    className={cx("max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-snug", c.who === "agent" ? "self-start rounded-bl-md bg-white/[0.08]" : "self-end rounded-br-md bg-[linear-gradient(135deg,rgba(255,181,71,.3),rgba(255,107,139,.22))]")}>
                    {c.text}
                  </motion.p>
                ))}
              </AnimatePresence>
            </div>
            <div className="mt-4 flex justify-center gap-5">
              <span className="grid size-11 place-items-center rounded-full bg-white/10 text-sm">🔇</span>
              <span className="grid size-11 place-items-center rounded-full bg-[#ff5a6e] text-sm">📞</span>
              <span className="grid size-11 place-items-center rounded-full bg-white/10 text-sm">🔊</span>
            </div>
          </div>
        </PhoneFrame>
        {/* signals flying out of the call */}
        <div className="pointer-events-none absolute inset-0" style={{ transform: "translateZ(60px)" }}>
          <AnimatePresence>
            {chips.map((c, k) => (
              <motion.div key={c.chip} initial={{ opacity: 0, x: 0, scale: 0.6 }} animate={{ opacity: 1, x: k % 2 ? 165 : -345, y: -190 + k * 96, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 120, damping: 16 }}
                className="k-glass absolute top-1/2 left-1/2 rounded-2xl border px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap shadow-[0_20px_40px_-20px_rgba(0,0,0,.7)]">
                {c.chip}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------ how it works (pinned)

const STEPS = [
  { k: "01", t: "09:30. Her phone rings.", d: "Any phone, even a ₹1,200 keypad one. No app, no smartphone, no reading. Just a warm voice in Hindi, Kannada or English, at the time she chose." },
  { k: "02", t: "A real conversation.", d: "Breakfast, sleep, the knee, the jasmine on her balcony. Medicines asked by name. Never a form, never “rate your mood from 1 to 5”." },
  { k: "03", t: "Every answer becomes a signal.", d: "The voice agent calls our MCP server mid-call: 23 tools behind a control layer with risk tiers, consent checks, PII redaction and an audit trail." },
  { k: "04", t: "The family knows in seconds.", d: "A clean Telegram card after every call. Scams and emergencies instantly. One tap, “I'm on it”, and every sibling's message updates." },
];

function SceneRing() {
  return (
    <div className="grid h-full place-items-center">
      <div className="relative grid place-items-center">
        {[0, 1, 2, 3].map((i) => <span key={i} className="animate-ripple absolute size-44 rounded-full border-2 border-saffron/40" style={{ animationDelay: `${i * 0.6}s` }} />)}
        <div className="relative grid size-32 place-items-center rounded-full bg-[conic-gradient(from_200deg,#ffc56e,#ff8f5a,#ff6b8b,#a993ff,#ffc56e)] shadow-[0_0_80px_rgba(255,181,71,.5)]">
          <span className="text-5xl">📞</span>
        </div>
        <p className="mt-56 font-mono text-xs tracking-[0.2em] text-[#9a96bd] uppercase">Calling Lakshmi Amma…</p>
      </div>
    </div>
  );
}
function SceneChat() {
  const lines = [["agent", "Namaste Amma! Aaj ghutne ka dard kaisa hai?"], ["amma", "Thoda kam hai beta, mandir ki seedhiyan chadhi thi kal."], ["agent", "Achha! Aur chameli mein phool aaye?"], ["amma", "Bahut saare! Kamala ko bhi diye."]];
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-6">
      {lines.map(([w, t], i) => (
        <motion.p key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.5 }}
          className={cx("max-w-[80%] rounded-3xl px-4 py-3 text-[14.5px]", w === "agent" ? "self-start rounded-bl-md bg-white/[0.07]" : "self-end rounded-br-md bg-[linear-gradient(135deg,rgba(255,181,71,.3),rgba(255,107,139,.2))]")}>
          <span className="mb-1 block font-mono text-[9px] tracking-[0.2em] text-[#9a96bd] uppercase">{w === "agent" ? "KaiseHo" : "Amma"}</span>{t}
        </motion.p>
      ))}
    </div>
  );
}
function SceneTools() {
  const rows = [
    ["log_wellbeing", "T1", "mood good · slept well · met people"],
    ["log_medication", "T1", "Metformin 500 mg · taken ✓"],
    ["log_vital", "T1", "sugar 126 fasting · in range"],
    ["check_scam", "T3", "digital arrest · 0.95 · family alerted"],
    ["add_need", "T1", "gas cylinder · cooking oil"],
    ["save_life_story", "T1", "“The wedding in Mysuru”"],
  ];
  const tone: Record<string, string> = { T1: "bg-[#5b8cff]/15 text-[#8fb0ff]", T2: "bg-[#ffb547]/15 text-[#ffc56e]", T3: "bg-[#ff5a6e]/20 text-[#ff8a99]" };
  return (
    <div className="flex h-full flex-col justify-center px-6">
      <p className="mb-3 font-mono text-[11px] tracking-[0.16em] text-[#9a96bd] uppercase">POST /mcp/agent · tools/call</p>
      <div className="space-y-2">
        {rows.map(([n, t, d], i) => (
          <motion.div key={n} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.28 }}
            className={cx("flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5 font-mono text-[12px]", t === "T3" && "border-[#ff5a6e]/40 bg-[#ff5a6e]/10")}>
            <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-bold", tone[t])}>{t}</span>
            <span className="text-[#f3f0ff]">{n}</span>
            <span className="ml-auto truncate text-[#9a96bd]">{d}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 font-mono text-[10.5px] text-[#9a96bd]">consent ✓ · rate limit ✓ · PII redacted ✓ · audit logged ✓</p>
    </div>
  );
}
export function TelegramCard({ acked = true }: { acked?: boolean }) {
  return (
    <div className="w-full max-w-[360px] rounded-[22px] bg-[#17212b] p-3 text-[13.5px] text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)] ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-2 px-1"><span className="grid size-7 place-items-center rounded-full bg-[conic-gradient(from_200deg,#ffc56e,#ff6b8b,#a993ff,#ffc56e)] text-[11px] font-bold text-[#1a1005]">K</span><span className="text-[13px] font-semibold">KaiseHo</span><span className="ml-auto font-mono text-[10px] text-white/40">10:42</span></div>
      <div className="rounded-2xl rounded-tl-md bg-[#182533] p-3 leading-snug ring-1 ring-white/5">
        <p className="font-semibold">🚨 URGENT · Scam call blocked</p>
        <p className="text-[11.5px] text-white/50 italic">Amma · 10:41</p>
        <p className="mt-2">A “CBI officer” told Amma her Aadhaar is in a money-laundering case and asked for an OTP.</p>
        <p className="mt-2">✅ She has NOT sent money. KaiseHo told her it&apos;s a scam.</p>
        <p className="mt-1">👉 Please call her today.</p>
        {acked && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ delay: 1.1 }} className="mt-2 border-t border-white/10 pt-2">✅ <b>Ravi</b> is on it · 10:42</motion.p>}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <span className="rounded-xl bg-[#2b5278]/70 py-2 text-center text-[12.5px]">🙋 I&apos;m on it</span>
        <span className="rounded-xl bg-[#2b5278]/70 py-2 text-center text-[12.5px]">📞 Call Amma now</span>
      </div>
    </div>
  );
}
function SceneFamily() {
  return (
    <div className="grid h-full place-items-center px-6">
      <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 90, damping: 14 }}>
        <TelegramCard />
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setI(Math.min(3, Math.max(0, Math.floor(v * 4.0001)))));
  const fill = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const SCENES = [SceneRing, SceneChat, SceneTools, SceneFamily];
  const Scene = SCENES[i];
  return (
    <section id="how" ref={ref} className="relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-10 px-5 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="k-label text-saffron">How it works</p>
            <h2 className="mt-3 font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-[3.6rem]">From one phone call to a <span className="k-grad-text font-serif font-normal italic">calmer family</span>.</h2>
            <div className="relative mt-10 pl-8">
              <div className="absolute top-1 bottom-1 left-[7px] w-[2px] rounded-full bg-ink/10"><motion.div style={{ height: fill }} className="w-full rounded-full bg-[linear-gradient(#ffc56e,#ff6b8b,#a993ff)]" /></div>
              {STEPS.map((s, k) => (
                <div key={s.k} className={cx("relative pb-7 transition-all duration-500", k === i ? "opacity-100" : "opacity-35")}>
                  <span className={cx("absolute top-1.5 -left-8 size-4 rounded-full ring-4 ring-cream transition", k <= i ? "bg-saffron shadow-[0_0_16px_var(--k-saffron)]" : "bg-ink/20")} />
                  <p className="k-label text-muted">{s.k}</p>
                  <p className="mt-1 font-display text-[1.45rem] font-semibold tracking-tight">{s.t}</p>
                  <AnimatePresence initial={false}>{k === i && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1.5 max-w-md overflow-hidden text-[15px] leading-relaxed text-muted">{s.d}</motion.p>}</AnimatePresence>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(120%_90%_at_30%_0%,#1e1b4b,#07071a_65%)] text-[#f3f0ff] shadow-[0_60px_120px_-40px_rgba(0,0,0,.8)]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
            <div className="absolute top-4 left-5 flex gap-1.5">{["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}</div>
            <p className="absolute top-3.5 right-5 font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase">Step {STEPS[i].k} / 04</p>
            <AnimatePresence mode="wait">
              <motion.div key={i} className="relative h-full pt-8" initial={{ opacity: 0, scale: 0.97, filter: "blur(8px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }} transition={{ duration: 0.5 }}>
                <Scene />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ scam spotlight

const SCAM_TEXT = "Ek CBI officer ka phone aaya. Bola mera Aadhaar money laundering case mein hai, video call pe rehna hai, kisi ko batana nahi, aur OTP maang raha tha.";
const FLAGS = ["CBI officer", "Aadhaar", "money laundering", "video call", "kisi ko batana nahi", "OTP"];

export function ScamSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const [phase, setPhase] = useState(0); // 0 typing, 1 scoring, 2 blocked
  const [score, setScore] = useState(0);
  useEffect(() => { if (!inView) { setPhase(0); setScore(0); } }, [inView]);
  useEffect(() => {
    if (phase !== 1) return;
    let s = 0;
    const id = setInterval(() => { s += 3; setScore(Math.min(95, s)); if (s >= 95) { clearInterval(id); setTimeout(() => setPhase(2), 400); } }, 30);
    return () => clearInterval(id);
  }, [phase]);
  const R = 92, C = 2 * Math.PI * R;
  return (
    <section ref={ref} id="safety" className="relative overflow-hidden py-28">
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_70%_50%,rgba(255,90,110,.18),transparent_70%)]" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-5 lg:grid-cols-2">
        <div>
          <p className="k-label text-danger">Scam Shield · the hero moment</p>
          <h2 className="mt-3 font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-[3.6rem]">“Digital arrest” ends <span className="font-serif font-normal text-danger italic">mid-sentence</span>.</h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted">India lost ₹22,495 crore to cyber fraud in 2025, much of it from elders on the phone. KaiseHo knows ten scam scripts: fake CBI, courier parcels, KYC expiry, electricity cut tonight, a “safe RBI account”. The moment she describes one, it calms her down, tells her exactly what to do, and alerts the family before the scammer calls back.</p>
          <div className="mt-6 flex flex-wrap gap-2">{["Never shares OTPs", "Hang up, call 1930", "Family alerted in ~2 s", "Weekly scam “vaccine” quiz"].map((t) => <span key={t} className="rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12.5px] ring-1 ring-sand">{t}</span>)}</div>
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="rounded-[26px] border border-white/10 bg-[#0b0b22] p-5 font-mono text-[13px] leading-relaxed text-[#e8e6ff] shadow-[0_40px_90px_-40px_rgba(0,0,0,.9)]">
            <p className="mb-3 text-[10px] tracking-[0.2em] text-white/40 uppercase">Amma, during her 09:30 call</p>
            <p>
              {inView && <Typed text={SCAM_TEXT} speed={24} run={inView} onDone={() => setPhase(1)} />}
            </p>
            {phase >= 1 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {FLAGS.map((f, i) => <motion.span key={f} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.12 }} className="rounded-md bg-[#ff5a6e]/20 px-2 py-0.5 text-[11px] text-[#ff9aa7] ring-1 ring-[#ff5a6e]/40">{f}</motion.span>)}
              </div>
            )}
          </div>
          <div className="relative mx-auto grid size-[230px] place-items-center">
            <svg viewBox="0 0 220 220" className="absolute inset-0 -rotate-90">
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="14" />
              <circle cx="110" cy="110" r={R} fill="none" stroke="url(#sg)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} style={{ transition: "stroke-dashoffset .1s linear" }} />
              <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stopColor="#ffb547" /><stop offset="1" stopColor="#ff5a6e" /></linearGradient></defs>
            </svg>
            <div className="text-center">
              <p className="font-display text-6xl font-semibold tabular">{score}</p>
              <p className="k-label text-muted">scam risk</p>
            </div>
            <AnimatePresence>{phase === 2 && (
              <motion.div initial={{ opacity: 0, scale: 1.6, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} className="absolute -bottom-6 rounded-xl border-2 border-danger bg-danger/15 px-3 py-1.5 font-mono text-[12px] font-bold tracking-[0.12em] text-danger uppercase backdrop-blur">
                Blocked · family alerted
              </motion.div>
            )}</AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ two doors (MCP)

export function TwoDoors() {
  const L = [
    { x: 70, y: 165, label: "Amma's phone", sub: "any keypad phone", c: "#ffb547", icon: "📞" },
    { x: 250, y: 165, label: "Voice agent", sub: "ElevenLabs · हिन्दी/ಕನ್ನಡ", c: "#ff8f5a", icon: "🗣️" },
  ];
  const R = [
    { x: 690, y: 50, label: "Claude", sub: "/mcp/family · 39 tools", c: "#a993ff", icon: "✳️" },
    { x: 690, y: 165, label: "Telegram", sub: "cards + one-tap actions", c: "#5bd7ff", icon: "✈️" },
    { x: 690, y: 280, label: "Dashboard", sub: "the whole family", c: "#3ee0a4", icon: "▦" },
  ];
  const paths: [string, string][] = [
    ["M 104 165 L 216 165", "#ffb547"], ["M 284 165 L 410 165", "#ff8f5a"],
    ["M 590 165 C 630 165, 626 50, 656 50", R[0].c], ["M 590 165 L 656 165", R[1].c], ["M 590 165 C 630 165, 626 280, 656 280", R[2].c],
  ];
  return (
    <div className="k-glass relative overflow-hidden rounded-[30px] border p-4 sm:p-8">
      <svg viewBox="0 0 900 340" className="w-full">
        <defs>
          <linearGradient id="core" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffb547" /><stop offset=".5" stopColor="#ff6b8b" /><stop offset="1" stopColor="#a993ff" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>
        {paths.map(([d, c], i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="var(--k-line-strong)" strokeWidth="2" />
            <path d={d} fill="none" stroke="url(#core)" strokeWidth="2" className="k-flow" />
            <circle r="4.5" fill={c}><animateMotion dur={`${1.8 + i * 0.35}s`} repeatCount="indefinite" path={d} /></circle>
          </g>
        ))}
        <rect x="410" y="105" width="180" height="120" rx="26" fill="url(#core)" opacity=".25" filter="url(#glow)" />
        <rect x="410" y="105" width="180" height="120" rx="26" fill="var(--k-bg)" stroke="url(#core)" strokeWidth="2" />
        <text x="500" y="143" textAnchor="middle" className="fill-ink font-display" fontSize="17" fontWeight="600">KaiseHo MCP</text>
        <text x="500" y="163" textAnchor="middle" className="fill-muted font-mono" fontSize="10">/mcp/agent · 23 tools</text>
        {["T0", "T1", "T2", "T3"].map((t, i) => (
          <g key={t}>
            <rect x={428 + i * 38} y="179" width="32" height="20" rx="6" fill={["#8f8ca8", "#5b8cff", "#ffb547", "#ff5a6e"][i]} opacity=".22" />
            <text x={444 + i * 38} y="193" textAnchor="middle" fontSize="10" fontWeight="700" fill={["#b9b6d3", "#8fb0ff", "#ffc56e", "#ff8a99"][i]} className="font-mono">{t}</text>
          </g>
        ))}
        {[...L, ...R].map((n, k) => (
          <g key={n.label}>
            <circle cx={n.x} cy={n.y} r="34" fill="var(--k-bg)" stroke={n.c} strokeWidth="2" />
            <circle cx={n.x} cy={n.y} r="34" fill={n.c} opacity=".12" />
            <text x={n.x} y={n.y + 7} textAnchor="middle" fontSize="20">{n.icon}</text>
            {k < 2 ? (
              <>
                <text x={n.x} y={n.y + 56} textAnchor="middle" fontSize="12.5" fontWeight="600" className="fill-ink">{n.label}</text>
                <text x={n.x} y={n.y + 71} textAnchor="middle" fontSize="9.5" className="fill-muted font-mono">{n.sub}</text>
              </>
            ) : (
              <>
                <text x={n.x + 46} y={n.y - 2} fontSize="14" fontWeight="600" className="fill-ink">{n.label}</text>
                <text x={n.x + 46} y={n.y + 14} fontSize="10" className="fill-muted font-mono">{n.sub}</text>
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-2 grid gap-3 text-[13px] sm:grid-cols-3">
        {[["Risk tiers", "T0 read · T1 log · T2 needs her consent · T3 safety, always allowed and alerted"], ["Privacy built in", "PII redacted before storage, OTPs never kept, raw transcripts gone in 24 h"], ["Audited", "Every tool call logged with who, what and why, visible to the family"]].map(([a, b]) => (
          <div key={a} className="rounded-2xl bg-ink/[0.03] p-3.5 ring-1 ring-sand"><p className="font-semibold">{a}</p><p className="mt-1 text-muted">{b}</p></div>
        ))}
      </div>
    </div>
  );
}

export function ClaudeChat() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  return (
    <div ref={ref} className="k-glass rounded-[26px] border p-5">
      <div className="flex items-center gap-2 border-b border-sand pb-3"><span className="grid size-7 place-items-center rounded-lg bg-[#d97757] text-[13px] text-white">✳</span><span className="text-[13px] font-semibold">Claude</span><span className="ml-auto rounded-full bg-violet/15 px-2 py-0.5 font-mono text-[10px] text-violet">KaiseHo connector</span></div>
      <div className="mt-4 space-y-3 text-[13.5px]">
        <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-ink/[0.07] px-3.5 py-2">How was Amma this week? Anything I should do?</p>
        {inView && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex flex-wrap gap-1.5">
              {["get_weekly_summary", "get_wellbeing", "get_needs", "get_life_stories"].map((t, i) => <motion.span key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.25 }} className="rounded-md bg-ink/[0.05] px-2 py-0.5 font-mono text-[10.5px] text-muted ring-1 ring-sand">⚙ {t}</motion.span>)}
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7 }} className="leading-relaxed">
              Good week overall. Her wellbeing is a little above her usual, she took 92% of her medicines and her knee pain is easing. Two things: <b>a fake “CBI” caller tried her on Tuesday</b> (she didn&apos;t share anything), and <b>the gas cylinder is due this week</b>. Priya has claimed it. She also told a lovely story about your first day at school. Want me to ask her another one?
            </motion.p>
          </>
        )}
      </div>
    </div>
  );
}
