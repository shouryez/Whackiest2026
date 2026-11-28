"use client";
import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";

function Box({ children, className, title, kicker, body, delay = 0 }: { children?: ReactNode; className?: string; title: string; kicker: string; body: string; delay?: number }) {
  return (
    <motion.article initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-8% 0px" }} transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}
      whileHover={{ y: -4 }}
      className={cx("k-glass k-spot group relative flex flex-col overflow-hidden rounded-[28px] border p-6", className)}>
      <p className="k-label text-saffron">{kicker}</p>
      <h3 className="mt-2 font-display text-[1.45rem] leading-tight font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
      {children && <div className="relative mt-5 flex-1">{children}</div>}
    </motion.article>
  );
}

function useLoop(n: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [i, setI] = useState(0);
  useEffect(() => { if (!inView) return; const id = setInterval(() => setI((x) => (x + 1) % n), ms); return () => clearInterval(id); }, [inView, n, ms]);
  return { ref, i };
}

function Meds() {
  const meds = ["Metformin 500 mg · after breakfast", "Amlodipine 5 mg · morning", "Atorvastatin 10 mg · after dinner"];
  const { ref, i } = useLoop(5, 900);
  return (
    <div ref={ref} className="space-y-2">
      {meds.map((m, k) => (
        <div key={m} className="flex items-center gap-3 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-[13px] ring-1 ring-sand">
          <span className={cx("grid size-5 place-items-center rounded-full text-[11px] transition-all duration-500", k < i ? "bg-forest text-on-forest scale-100" : "scale-90 bg-ink/10 text-transparent")}>✓</span>
          <span className={cx("transition", k < i ? "" : "text-muted")}>{m}</span>
        </div>
      ))}
    </div>
  );
}

function Radar() {
  const { ref, i } = useLoop(2, 1800);
  const a = [[80, 70, 60, 85, 75, 65], [65, 85, 80, 70, 90, 80]][i];
  const pts = a.map((v, k) => { const ang = (Math.PI * 2 * k) / 6 - Math.PI / 2; const r = (v / 100) * 70; return `${90 + r * Math.cos(ang)},${90 + r * Math.sin(ang)}`; }).join(" ");
  return (
    <div ref={ref} className="grid place-items-center">
      <svg viewBox="-24 -6 228 196" className="h-44 w-52">
        {[1, 0.66, 0.33].map((s) => <polygon key={s} points={Array.from({ length: 6 }, (_, k) => { const ang = (Math.PI * 2 * k) / 6 - Math.PI / 2; return `${90 + 70 * s * Math.cos(ang)},${90 + 70 * s * Math.sin(ang)}`; }).join(" ")} fill="none" stroke="var(--k-line-strong)" />)}
        <motion.polygon animate={{ points: pts }} transition={{ duration: 1.2, ease: "easeInOut" }} fill="url(#rg)" fillOpacity=".35" stroke="var(--k-saffron)" strokeWidth="2" />
        <defs><linearGradient id="rg"><stop stopColor="#ffb547" /><stop offset="1" stopColor="#ff6b8b" /></linearGradient></defs>
        {["mood", "sleep", "food", "company", "active", "comfort"].map((l, k) => { const ang = (Math.PI * 2 * k) / 6 - Math.PI / 2; return <text key={l} x={90 + 86 * Math.cos(ang)} y={92 + 86 * Math.sin(ang)} textAnchor="middle" fontSize="9" className="fill-muted font-mono">{l}</text>; })}
      </svg>
    </div>
  );
}

function Words() {
  const words = [["aam", "mango"], ["kursi", "chair"], ["neela", "blue"]];
  const { ref, i } = useLoop(4, 1100);
  return (
    <div ref={ref} className="flex flex-wrap gap-2">
      {words.map(([h, e], k) => (
        <motion.span key={h} animate={{ rotateX: k < i ? 0 : 90, opacity: k < i ? 1 : 0.2 }} transition={{ duration: 0.5 }} className="rounded-2xl bg-rose-soft px-4 py-3 ring-1 ring-rose/30">
          <span className="font-serif text-xl italic">{h}</span><span className="ml-2 font-mono text-[10px] text-muted">{e}</span>
        </motion.span>
      ))}
      <p className="mt-1 w-full font-mono text-[11px] text-muted">{i === 3 ? "✓ remembered 3/3 · in line with her usual" : "remember these till the end of the call…"}</p>
    </div>
  );
}

function Needs() {
  const { ref, i } = useLoop(4, 1300);
  const items = [["🔥", "Gas cylinder", "Priya"], ["🧺", "Atta and toor dal", "Ravi"], ["💊", "Metformin strip", "Priya"]];
  return (
    <div ref={ref} className="space-y-2">
      {items.map(([e, t, who], k) => (
        <div key={t} className="flex items-center gap-3 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-[13px] ring-1 ring-sand">
          <span>{e}</span><span className="flex-1">{t}</span>
          <motion.span animate={{ opacity: k < i ? 1 : 0, x: k < i ? 0 : 10 }} className="rounded-full bg-violet/15 px-2 py-0.5 text-[11px] text-violet">🙋 {who}</motion.span>
        </div>
      ))}
    </div>
  );
}

function Sos() {
  return (
    <div className="grid h-40 place-items-center">
      <div className="relative grid place-items-center">
        {[0, 1, 2].map((k) => <span key={k} className="animate-ripple absolute size-24 rounded-full bg-danger/30" style={{ animationDelay: `${k * 0.7}s` }} />)}
        <span className="relative grid size-20 place-items-center rounded-full bg-danger font-display text-xl font-bold text-white shadow-[0_0_50px_var(--k-danger)]">SOS</span>
      </div>
    </div>
  );
}

function Story() {
  return (
    <figure className="rounded-2xl bg-[linear-gradient(160deg,var(--k-saffron-soft),transparent)] p-5 ring-1 ring-saffron/25">
      <p className="k-label text-muted">Chapter 01 · Young years</p>
      <p className="mt-2 font-serif text-[1.6rem] leading-tight italic">The wedding in Mysuru</p>
      <blockquote className="k-dropcap mt-3 text-[14px] leading-relaxed">It rained the whole morning and everyone said it was a good sign. Your Appa arrived on a borrowed scooter because the car broke down near Chamundi hill…</blockquote>
      <figcaption className="mt-3 font-serif text-[13px] text-muted italic">— Lakshmi Amma, asked by Aarav</figcaption>
    </figure>
  );
}

function StoryIndex() {
  const ch = [["02", "Learning to cook from Ajji", "Childhood"], ["03", "Ravi's first day of school", "Raising a family"], ["04", "What I'd tell my grandchildren", "Wisdom"], ["05", "My first film: Kasturi Nivasa", "Adventures"]];
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
      <ol className="space-y-1.5">
        {ch.map(([n, t, e], i) => (
          <motion.li key={n} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.12 }}
            className="flex items-baseline gap-3 border-b border-dashed border-sand py-2">
            <span className="font-mono text-[11px] text-saffron">{n}</span>
            <span className="flex-1 font-serif text-[1.05rem] italic">{t}</span>
            <span className="k-label text-[8.5px] text-muted">{e}</span>
          </motion.li>
        ))}
      </ol>
      <div className="rounded-2xl bg-[#17212b] p-3 text-[12.5px] text-white ring-1 ring-white/10">
        <p className="font-semibold">📖 Amma told a story</p>
        <p className="mt-1 text-white/70">“My first film: Kasturi Nivasa”, asked by Aarav</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5"><span className="rounded-lg bg-[#2b5278]/70 py-1.5 text-center">❤️ Loved it</span><span className="rounded-lg bg-[#2b5278]/70 py-1.5 text-center">📖 Ask another</span></div>
        <p className="mt-2 text-[11px] text-white/50">“Loved it” is told to her in the next call.</p>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Box className="md:col-span-4 md:row-span-2" kicker="Yaadein · story book" title="Her life story, in her own words." body="Every few days KaiseHo asks one gentle “tell me about…”. Grandchildren can send their own question from Telegram. With her yes, each answer becomes a chapter the family keeps forever.">
        <Story />
        <StoryIndex />
      </Box>
      <Box className="md:col-span-2" kicker="Medicines" title="Asked by name, never nagged." body="“Did you take your Metformin after breakfast?” Missed critical doses get one gentle follow-up call." delay={0.05}><Meds /></Box>
      <Box className="md:col-span-2" kicker="Wellbeing" title="Read from conversation." body="Six dimensions from how she talks: mood, sleep, food, company, activity, comfort. No ratings." delay={0.1}><Radar /></Box>
      <Box className="md:col-span-2" kicker="Mind gym" title="Three words, once a week." body="A playful recall game. Scores compared only with her own usual; a sustained dip becomes a gentle doctor note." delay={0.05}><Words /></Box>
      <Box className="md:col-span-2" kicker="Household list" title="“The gas is low.” Sorted." body="Things she mentions become a shared list. One sibling taps “I'll handle it”, and she hears who." delay={0.1}><Needs /></Box>
      <Box className="md:col-span-2" kicker="Emergency cascade" title="Chest pain? 112 first." body="It tells her what to do, then reaches every family member and the neighbour at once." delay={0.15}><Sos /></Box>
    </div>
  );
}

export const MORE_FEATURES = [
  ["🩸", "Readings by voice", "“Sugar was 126.” Logged, ranged, charted."],
  ["🏦", "Pension life certificate", "Reminds every November, spots the fake “update” calls."],
  ["🎉", "Birthdays & festivals", "Relays her wishes to the grandchildren."],
  ["🧾", "Doctor brief", "One printable page before every visit."],
  ["🆔", "Emergency health card", "A QR on the fridge for neighbours and paramedics."],
  ["💬", "Messages both ways", "Your words, said warmly in her next call."],
  ["🎙️", "Her choice of style", "Clear assistant or warm companion. Never a cloned voice."],
  ["🗓️", "Away mode", "Staying with you this week? One tap pauses calls."],
];
