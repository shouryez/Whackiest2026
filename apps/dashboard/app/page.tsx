"use client";
import { ArrowRight, ArrowUpRight, Lock, PhoneCall, Play, ShieldCheck, Timer, UserCheck } from "lucide-react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle, Wordmark } from "@/components/AppShell";
import { FeaturesBento, MORE_FEATURES } from "@/components/landing/bento";
import { Counter, CyclingWord, Magnetic, Marquee, Reveal, ScrollWords, useLenis } from "@/components/landing/fx";
import { ClaudeChat, HeroPhone, HowItWorks, ScamSpotlight, TelegramCard, TwoDoors } from "@/components/landing/scenes";
import { cx } from "@/components/ui";

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 40); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <nav className={cx("flex w-full items-center justify-between gap-4 rounded-full px-3 py-2 transition-all duration-500", scrolled ? "k-glass max-w-[980px] border pl-4" : "max-w-[1240px] border border-transparent")}>
        <Wordmark href="/" />
        <div className="hidden items-center gap-1 text-[13.5px] text-muted md:flex">
          {[["#problem", "Why"], ["#how", "How it works"], ["#features", "Features"], ["#safety", "Safety"], ["#claude", "For Claude"]].map(([h, l]) => (
            <a key={h} href={h} className="rounded-full px-3 py-1.5 transition hover:bg-ink/[0.06] hover:text-ink">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/app" className="group flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-cream transition hover:gap-2.5">Open dashboard<ArrowRight className="size-3.5" /></Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  return (
    <section ref={ref} className="relative min-h-screen overflow-hidden pt-28">
      <motion.div style={{ y, opacity: fade, scale }} className="mx-auto grid max-w-[1240px] items-center gap-6 px-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative z-10">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-2 rounded-full bg-ink/[0.05] py-1 pr-3 pl-1 text-[12.5px] ring-1 ring-sand">
            <span className="rounded-full bg-saffron px-2 py-0.5 font-mono text-[10px] font-bold text-on-saffron">NEW</span>Story book, mind gym & Telegram 2.0
          </motion.p>
          <h1 className="mt-6 font-display text-[clamp(3.4rem,8.6vw,7.6rem)] leading-[0.88] font-semibold tracking-[-0.055em]">
            <motion.span initial={{ opacity: 0, y: 40, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay: 0.15 }} className="block">Kaise ho,</motion.span>
            <motion.span initial={{ opacity: 0, y: 40, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay: 0.3 }} className="block">
              <CyclingWord words={["Amma?", "अम्मा?", "Appa?", "ಅಮ್ಮ?", "Nani?", "Dadi?"]} className="k-grad-text k-glow pr-4 font-serif font-normal tracking-[-0.03em] italic" />
            </motion.span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-7 max-w-[34rem] text-[17.5px] leading-relaxed text-muted">
            One warm AI phone call a day for the people who raised you. In their language, on any phone. Medicines, mood, scams and emergencies handled, and the whole family knows in seconds.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mt-9 flex flex-wrap items-center gap-3">
            <Magnetic>
              <Link href="/app" className="group relative flex h-13 items-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(135deg,#ffc56e,#ffb547_45%,#ff8f5a)] px-7 text-[15px] font-semibold text-on-saffron shadow-[0_18px_50px_-14px_rgba(255,181,71,.8),inset_0_1px_0_rgba(255,255,255,.5)]">
                <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
                Open the family dashboard<ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
            </Magnetic>
            <a href="#how" className="flex h-13 items-center gap-2.5 rounded-full px-5 text-[15px] font-semibold ring-1 ring-sand-deep transition hover:bg-ink/[0.05]">
              <span className="grid size-7 place-items-center rounded-full bg-ink text-cream"><Play className="size-3 fill-current" /></span>Watch a call happen
            </a>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95 }} className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            <span>☎ any keypad phone</span><span>हिन्दी · ಕನ್ನಡ · English</span><span>consent first</span><span>MCP for Claude</span>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }} className="relative h-[680px]">
          <div className="absolute inset-0 grid place-items-center"><HeroPhone /></div>
        </motion.div>
      </motion.div>
      <motion.div style={{ opacity: fade }} className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-muted uppercase">
        scroll<span className="h-10 w-[1.5px] overflow-hidden rounded-full bg-ink/15"><span className="block h-4 w-full animate-[float_1.6s_ease-in-out_infinite] bg-saffron" /></span>
      </motion.div>
    </section>
  );
}

function Problem() {
  const stats = [
    { n: 22, s: "%", l: "of India's elderly live alone or with only a spouse; children moving away is the biggest reason", src: "BKPAI survey" },
    { n: 22495, p: "₹", s: " cr", l: "lost to cyber fraud in 2025. Digital-arrest scams target elders on the phone", src: "NCRP data" },
    { n: 33.7, s: "%", d: 1, l: "of elders take five or more medicines a day, often unsupervised", src: "six-city study" },
    { n: 250, s: "M+", l: "Indians still use keypad phones, which every elder-care app ignores", src: "TelecomTalk" },
  ];
  return (
    <section id="problem" className="relative mx-auto max-w-[1240px] px-5 py-32">
      <p className="k-label text-saffron">The problem</p>
      <ScrollWords className="mt-6 max-w-[1100px] font-display text-[clamp(2rem,4.6vw,4.1rem)] leading-[1.08] font-semibold tracking-[-0.04em]" accent={["fine,", "beta.”", "alone", "“cbi"]}
        text="Every weekly call says “all fine, beta.” It hides the skipped BP tablet, the knee that's slowly getting worse, three evenings eaten alone, and the “CBI officer” who called yesterday." />
      <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.08}>
            <div className="k-glass k-spot h-full rounded-[26px] border p-6">
              <p className="font-display text-[3rem] leading-none font-semibold tracking-[-0.04em]"><span className="k-grad-text"><Counter to={s.n} prefix={s.p} suffix={s.s} decimals={s.d ?? 0} /></span></p>
              <p className="mt-4 text-[14px] leading-relaxed text-muted">{s.l}</p>
              <p className="k-label mt-4 text-[9px] text-muted/70">{s.src}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-16">
        <p className="mx-auto max-w-3xl text-center font-serif text-[clamp(1.6rem,3vw,2.5rem)] leading-snug italic">
          The phone call is the one interface every parent already uses fluently. <span className="k-grad-text">So we made it smarter.</span>
        </p>
      </Reveal>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-[1240px] px-5 py-32">
      <Reveal>
        <p className="k-label text-saffron">Everything one call can do</p>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.98] font-semibold tracking-[-0.045em]">Not a health tracker. A <span className="k-grad-text font-serif font-normal italic">good grandchild</span> who never forgets.</h2>
      </Reveal>
      <div className="mt-14"><FeaturesBento /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MORE_FEATURES.map(([e, t, d], i) => (
          <Reveal key={t} delay={(i % 4) * 0.06}>
            <div className="k-glass k-spot flex h-full gap-3.5 rounded-[22px] border p-4.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05] text-lg ring-1 ring-sand">{e}</span>
              <div><p className="text-[14px] font-semibold">{t}</p><p className="mt-0.5 text-[12.5px] leading-snug text-muted">{d}</p></div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ForClaude() {
  return (
    <section id="claude" className="relative mx-auto max-w-[1240px] px-5 py-32">
      <Reveal>
        <p className="k-label text-violet">Track 01 · Make MCP Matter</p>
        <h2 className="mt-3 max-w-4xl font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.98] font-semibold tracking-[-0.045em]">One brain, <span className="k-grad-text font-serif font-normal italic">two doors</span>.</h2>
        <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-muted">The same MCP server answers Amma&apos;s voice agent on the phone and her son&apos;s Claude on his laptop. A phone call for the parent, an AI chat for the child, and a control layer in between that decides what each door may do.</p>
      </Reveal>
      <Reveal className="mt-12"><TwoDoors /></Reveal>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Reveal><ClaudeChat /></Reveal>
        <Reveal delay={0.1}>
          <div className="k-glass rounded-[26px] border p-6">
            <p className="k-label text-muted">Add it to Claude in 30 seconds</p>
            <p className="mt-2 font-display text-xl font-semibold">Settings → Connectors → Add custom connector</p>
            <code className="mt-4 block overflow-x-auto rounded-xl bg-ink/[0.06] px-4 py-3 font-mono text-[12.5px] ring-1 ring-sand">https://&lt;your-kaiseho&gt;/mcp/family?token=…</code>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[["23", "agent tools"], ["39", "family tools"], ["4", "risk tiers"]].map(([n, l]) => <div key={l} className="rounded-2xl bg-ink/[0.03] p-3 ring-1 ring-sand"><p className="font-display text-3xl font-semibold"><span className="k-grad-text">{n}</span></p><p className="k-label mt-1 text-[9px] text-muted">{l}</p></div>)}
            </div>
            <Link href="/app/connect" className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-saffron hover:underline">Get your connector link <ArrowUpRight className="size-4" /></Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TelegramSection() {
  return (
    <section className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-28 lg:grid-cols-2">
      <Reveal>
        <p className="k-label text-teal">Telegram · the family&apos;s remote control</p>
        <h2 className="mt-3 font-display text-[clamp(2.3rem,4.6vw,3.8rem)] leading-[0.98] font-semibold tracking-[-0.045em]">One tap. <span className="k-grad-text font-serif font-normal italic">Everyone</span> knows.</h2>
        <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted">A clean card after every call. Tap “I&apos;m on it” and every sibling&apos;s copy updates, so nobody calls twice and nothing falls through. Type anything and Amma hears it in her next call.</p>
        <div className="mt-6 grid max-w-lg grid-cols-2 gap-2 font-mono text-[12.5px]">
          {["/today", "/tell", "/needs", "/remind tomorrow 9am", "/story", "/away"].map((c) => <span key={c} className="rounded-xl bg-ink/[0.04] px-3 py-2 ring-1 ring-sand">{c}</span>)}
        </div>
      </Reveal>
      <Reveal delay={0.1} className="grid place-items-center">
        <div className="relative">
          <div className="absolute -inset-10 rounded-full bg-teal/15 blur-3xl" />
          <motion.div whileHover={{ rotate: 0, scale: 1.02 }} initial={{ rotate: 3 }} className="relative"><TelegramCard /></motion.div>
        </div>
      </Reveal>
    </section>
  );
}

function Privacy() {
  const items = [
    { icon: UserCheck, t: "She says yes first.", d: "A welcome call explains everything. No daily calls until she agrees, at the time she picks." },
    { icon: Lock, t: "She decides what's shared.", d: "Medicines, mood, stories: each one is her choice. “Don't tell Ravi” is respected, and she can ask what was shared." },
    { icon: Timer, t: "Raw transcripts gone in 24 h.", d: "Only short summaries and simple fields are kept. No audio, no OTPs, no bank numbers, ever." },
    { icon: ShieldCheck, t: "Never a fake person.", d: "KaiseHo always says it's an AI helper. No cloned voices of family members." },
  ];
  return (
    <section className="relative mx-auto max-w-[1240px] px-5 py-28">
      <Reveal>
        <p className="k-label text-forest">Dignity by design</p>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.3rem,4.6vw,3.8rem)] leading-[0.98] font-semibold tracking-[-0.045em]">Built <span className="font-serif font-normal italic">with</span> her, not <span className="font-serif font-normal italic">about</span> her.</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((x, i) => (
          <Reveal key={x.t} delay={i * 0.07}>
            <div className="k-glass k-spot h-full rounded-[26px] border p-6">
              <span className="grid size-11 place-items-center rounded-2xl bg-forest-soft text-forest ring-1 ring-forest/25"><x.icon className="size-5" /></span>
              <p className="mt-5 font-display text-[1.2rem] font-semibold tracking-tight">{x.t}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{x.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-5 py-36 text-center">
      <div className="absolute top-1/2 left-1/2 size-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,181,71,.3),rgba(255,107,139,.14)_40%,transparent_70%)] blur-2xl" />
      {[0, 1, 2].map((i) => <span key={i} className="animate-ripple absolute top-1/2 left-1/2 -mt-[180px] -ml-[180px] size-[360px] rounded-full border border-saffron/25" style={{ animationDelay: `${i * 0.8}s` }} />)}
      <Reveal className="relative">
        <h2 className="font-display text-[clamp(3rem,9vw,8rem)] leading-[0.9] font-semibold tracking-[-0.055em]">Call <span className="k-grad-text k-glow font-serif font-normal italic">Amma</span> today.</h2>
        <p className="mx-auto mt-6 max-w-xl text-[17px] text-muted">KaiseHo makes sure you know when, and what to ask. Our success metric is more family calls, not fewer.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <Link href="/app" className="flex h-14 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffc56e,#ffb547_45%,#ff8f5a)] px-8 text-[16px] font-semibold text-on-saffron shadow-[0_20px_60px_-14px_rgba(255,181,71,.85)]">Open the family dashboard<ArrowRight className="size-4" /></Link>
          </Magnetic>
          <Link href="/live" className="flex h-14 items-center gap-2 rounded-full px-6 text-[15px] font-semibold ring-1 ring-sand-deep hover:bg-ink/[0.05]"><PhoneCall className="size-4" />See Live Ops</Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-sand px-5 py-12">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-8">
        <div>
          <Wordmark href="/" />
          <p className="mt-3 max-w-sm text-[13px] text-muted">A daily AI check-in call for elderly parents, built on Ek Call: ElevenLabs voice agents and our own MCP server.</p>
        </div>
        <div className="text-[13px] text-muted">
          <p className="k-label mb-2 text-ink">Team SantaClaude</p>
          <p>Shourya Chouhan · Shreya Singh Chouhan</p>
          <p>Daksh Bhatt · Devansh Jain</p>
          <p className="mt-2">M S Ramaiah Institute of Technology</p>
        </div>
        <div className="text-[13px] text-muted">
          <p className="k-label mb-2 text-ink">wHACKiest 2026</p>
          <p>Track 01 · Make MCP Matter</p>
          <p className="mt-2">Helplines: Elderline 14567 · Cyber fraud 1930 · Emergency 112</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useLenis();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return (
    <div className="overflow-x-clip">
      <motion.div style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-[linear-gradient(90deg,#ffc56e,#ff6b8b,#a993ff)]" />
      <Nav />
      <Hero />
      <div className="border-y border-sand bg-ink/[0.02] py-5 font-display text-[1.35rem] font-semibold tracking-tight">
        <Marquee items={["Medicines by name", "Scam Shield", "हिन्दी", "ಕನ್ನಡ", "English", "Emergency cascade", "Story book", "Mind gym", "Pension life certificate", "Household list", "Doctor brief", "Claude via MCP"].map((t) => <span key={t} className={cx(/[^\x00-\x7F]/.test(t) && "font-serif font-normal italic")}>{t}</span>)} />
      </div>
      <Problem />
      <HowItWorks />
      <Features />
      <ScamSpotlight />
      <ForClaude />
      <TelegramSection />
      <Privacy />
      <FinalCta />
      <Footer />
    </div>
  );
}
