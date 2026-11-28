"use client";
import { BookOpen, Feather, Lock, MapPin, MessageCircleQuestion, Send, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { post } from "@/lib/api";
import { dayLabel, timeAgo } from "@/lib/format";
import { useApi, useLive } from "@/lib/live";
import { Badge, Button, Card, CardHeader, Empty, Skeleton, cx } from "./ui";

export interface Story { storyId: string; title: string; text: string; era?: string; people: string[]; place?: string; prompt?: string; askedBy?: string; createdAt: string }
export interface Book { shared: boolean; note?: string; stories: Story[]; waiting: { askId: string; question: string; fromName: string; createdAt: string }[]; suggestions: { id: string; question: string; era: string }[]; words: number }

const ERA_ORDER = ["Childhood", "Young years", "Raising a family", "Adventures", "Recipes", "Wisdom"];
const ERA_TINT: Record<string, string> = {
  Childhood: "from-saffron/25", "Young years": "from-rose/25", "Raising a family": "from-violet/25", Adventures: "from-teal/25", Recipes: "from-forest/25", Wisdom: "from-saffron/20",
};

export function useBook(elderId: string) {
  return useApi<Book>(`/elders/${elderId}/stories`);
}

/** One chapter: serif title, drop cap, who asked, where and who's in it. */
export function StoryPage({ s, n, i }: { s: Story; n: string; i: number }) {
  const [open, setOpen] = useState(false);
  const long = s.text.length > 420;
  return (
    <article className={cx("k-glass k-spot group relative overflow-hidden rounded-[26px] border p-6 sm:p-7", "bg-gradient-to-br to-transparent", ERA_TINT[s.era ?? ""] ?? "from-saffron/15")}>
      <div className="flex items-center justify-between gap-3">
        <p className="k-label text-muted">Chapter {String(i + 1).padStart(2, "0")}{s.era ? ` · ${s.era}` : ""}</p>
        <p className="k-label text-muted">{dayLabel(s.createdAt.slice(0, 10))}</p>
      </div>
      <h3 className="mt-3 font-serif text-[1.9rem] leading-[1.05] tracking-tight italic">{s.title}</h3>
      {s.prompt && <p className="mt-2 text-[12.5px] text-muted">{s.askedBy ? <><b className="text-ink">{s.askedBy}</b> asked: </> : "KaiseHo asked: "}“{s.prompt}”</p>}
      <p className={cx("k-dropcap mt-4 text-[15.5px] leading-[1.75] text-ink/90", !open && long && "line-clamp-6")}>{s.text}</p>
      {long && <button onClick={() => setOpen(!open)} className="mt-2 text-xs font-semibold text-saffron hover:underline">{open ? "Show less" : "Read the whole story"}</button>}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
        {s.place && <Badge><MapPin className="size-3" />{s.place}</Badge>}
        {s.people.slice(0, 4).map((p) => <Badge key={p} tone="navy"><Users className="size-3" />{p}</Badge>)}
        <span className="ml-auto font-serif text-[14px] text-muted italic">— {n}, in her own words</span>
      </div>
    </article>
  );
}

export function AskStoryCard({ elderId, n, book, reload }: { elderId: string; n: string; book?: Book; reload: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { bump } = useLive();
  const ask = async (question: string) => {
    if (question.trim().length < 8) return;
    setBusy(true);
    try { await post(`/elders/${elderId}/story-asks`, { question, fromName: "Ravi" }); setQ(""); setDone(question); reload(); bump(); } finally { setBusy(false); }
  };
  return (
    <Card glow className="h-full">
      <CardHeader icon={MessageCircleQuestion} tone="saffron" kicker="Asked warmly in her next call" title={`Ask ${n} for a story`} />
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How did you learn to cook?"
          className="h-11 min-w-0 flex-1 rounded-full border border-sand-deep bg-ink/[0.03] px-4 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/25" />
        <Button icon={Send} disabled={busy || q.trim().length < 8}>Ask</Button>
      </form>
      {done && <p className="animate-slide-in mt-3 rounded-xl bg-forest-soft px-3 py-2 text-[12.5px] text-forest">✓ KaiseHo will ask “{done}”. The story arrives here and on Telegram.</p>}
      <p className="k-label mt-5 mb-2 text-muted">Or pick one</p>
      <div className="flex flex-wrap gap-2">
        {(book?.suggestions ?? []).slice(0, 5).map((s) => (
          <button key={s.id} onClick={() => ask(s.question)} disabled={busy} className="rounded-full bg-ink/[0.04] px-3 py-1.5 text-left text-[12.5px] ring-1 ring-sand transition hover:bg-saffron-soft hover:ring-saffron/40">{s.question}</button>
        ))}
      </div>
      {(book?.waiting.length ?? 0) > 0 && (
        <>
          <p className="k-label mt-5 mb-2 text-muted">Waiting for her next call</p>
          <ul className="space-y-1.5">
            {book!.waiting.map((w) => <li key={w.askId} className="flex items-center gap-2 text-[13px]"><span className="size-1.5 animate-pulse rounded-full bg-saffron" /><span className="flex-1">“{w.question}”</span><span className="text-[11px] text-muted">{w.fromName} · {timeAgo(w.createdAt)}</span></li>)}
          </ul>
        </>
      )}
    </Card>
  );
}

/** The whole book: chapters grouped by era. */
export function StoryBook({ elderId, n }: { elderId: string; n: string }) {
  const { data: book, reload } = useBook(elderId);
  if (!book) return <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>;
  const eras = [...new Set(book.stories.map((s) => s.era ?? "Other"))].sort((a, b) => (ERA_ORDER.indexOf(a) + 99) % 99 - (ERA_ORDER.indexOf(b) + 99) % 99);
  let k = 0;
  const ordered = eras.flatMap((era) => book.stories.filter((s) => (s.era ?? "Other") === era).map((s) => ({ s, i: k++ })));
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="k-glass k-ring relative overflow-hidden rounded-[28px] border p-7 sm:p-9 lg:col-span-7">
          <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-saffron/20 blur-3xl" />
          <p className="k-label flex items-center gap-2 text-saffron"><Feather className="size-3.5" />Yaadein · यादें</p>
          <h2 className="mt-3 font-display text-[2.4rem] leading-[1] font-semibold tracking-[-0.04em] sm:text-[3.2rem]">{n}&apos;s story book<span className="text-saffron">.</span></h2>
          <p className="mt-3 max-w-lg text-[15px] text-muted">Every few days KaiseHo asks one gentle “tell me about…”. With her yes, the story is kept here for the grandchildren, in her own words: the stories that usually disappear with a generation.</p>
          <div className="mt-6 flex flex-wrap gap-8">
            <div><p className="font-display text-4xl font-semibold tabular">{book.stories.length}</p><p className="k-label text-muted">chapters</p></div>
            <div><p className="font-display text-4xl font-semibold tabular">{book.words.toLocaleString("en-IN")}</p><p className="k-label text-muted">words in her voice</p></div>
            <div><p className="font-display text-4xl font-semibold tabular">{eras.length}</p><p className="k-label text-muted">chapters of life</p></div>
          </div>
        </section>
        <div id="ask" className="scroll-mt-24 lg:col-span-5"><AskStoryCard elderId={elderId} n={n} book={book} reload={reload} /></div>
      </div>
      {!book.shared ? (
        <Card><Empty icon={Lock} title="Her stories stay with her">{book.note}</Empty></Card>
      ) : !ordered.length ? (
        <Card><Empty icon={BookOpen} title="The first chapter is coming">Ask a question above. KaiseHo will ask it in her next check-in.</Empty></Card>
      ) : (
        <div className="columns-1 gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
          {ordered.map(({ s, i }) => <StoryPage key={s.storyId} s={s} n={n} i={i} />)}
        </div>
      )}
    </div>
  );
}

/** Small overview tile: the latest chapter as a quote. */
export function LatestStoryTile({ elderId, n }: { elderId: string; n: string }) {
  const { data } = useBook(elderId);
  const s = data?.stories[0];
  return (
    <Link href="/app/stories" className="k-glass k-spot group relative block h-full overflow-hidden rounded-[24px] border p-5 transition hover:border-sand-deep">
      <div className="pointer-events-none absolute -right-10 -bottom-10 size-40 rounded-full bg-rose/15 blur-2xl" />
      <div className="flex items-center justify-between">
        <p className="k-label text-muted">From her story book</p>
        <BookOpen className="size-4 text-rose" />
      </div>
      {s ? (
        <>
          <p className="mt-3 font-serif text-[1.35rem] leading-tight italic">{s.title}</p>
          <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">“{s.text}”</p>
          <p className="k-label mt-3 text-saffron transition group-hover:translate-x-1">Read {data!.stories.length} chapters →</p>
        </>
      ) : <p className="mt-3 text-sm text-muted">No stories yet. Ask {n} for one.</p>}
    </Link>
  );
}
