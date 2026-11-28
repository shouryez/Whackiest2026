import type { Elder, GameKind, GameResult } from "@kaiseho/shared";
import { emit } from "../../engine/events";
import { addDays, localDate, newId, nowIso } from "../../engine/ids";
import { getRepo } from "../../repo";
import { createAlert } from "./alerts";
import { pr } from "./pronouns";

/**
 * Mind gym: every third check-in, one playful 30-second game (three words to remember
 * until the end of the call, or "name as many fruits as you can"). Scores are only ever
 * compared with her own usual; a sustained dip becomes a gentle "mention it to the doctor",
 * never a diagnosis. Early, cheap, daily signal that families usually only notice too late.
 */
export const WORD_SETS: { hi: string[]; en: string[] }[] = [
  { hi: ["आम", "कुर्सी", "नीला"], en: ["mango", "chair", "blue"] },
  { hi: ["गुलाब", "रेलगाड़ी", "चम्मच"], en: ["rose", "train", "spoon"] },
  { hi: ["तोता", "किताब", "लाल"], en: ["parrot", "book", "red"] },
  { hi: ["नदी", "घड़ी", "केला"], en: ["river", "clock", "banana"] },
  { hi: ["मंदिर", "छाता", "हरा"], en: ["temple", "umbrella", "green"] },
  { hi: ["बिल्ली", "चाबी", "पीला"], en: ["cat", "key", "yellow"] },
  { hi: ["पहाड़", "कंघी", "अमरूद"], en: ["mountain", "comb", "guava"] },
  { hi: ["मोर", "दरवाज़ा", "सफ़ेद"], en: ["peacock", "door", "white"] },
];
export const CATEGORIES: { hi: string; en: string }[] = [
  { hi: "फल", en: "fruits" }, { hi: "सब्ज़ियाँ", en: "vegetables" }, { hi: "त्योहार", en: "festivals" },
  { hi: "जानवर", en: "animals" }, { hi: "फूल", en: "flowers" }, { hi: "मिठाइयाँ", en: "sweets" },
];
export const GAME_LABEL: Record<GameKind, string> = { word_recall: "Three-word recall", category_naming: "Name as many as you can", story_recall: "Story recall" };

const pct = (g: GameResult) => Math.round((g.score / Math.max(1, g.max)) * 100);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Dynamic variable `brain_game`: today's game, or "none" (only every third regular check-in). */
export async function gameNote(elder: Elder, reason: string, today = localDate(elder.tz)): Promise<string> {
  if (reason !== "daily" && reason !== "checkin") return "none";
  const games = await getRepo().listGames(elder.elderId, addDays(today, -2));
  if (games.length) return "none";
  const all = await getRepo().listGames(elder.elderId);
  const words = all.filter((g) => g.game === "word_recall").length;
  const names = all.filter((g) => g.game === "category_naming").length;
  if (words <= names) {
    const set = WORD_SETS[words % WORD_SETS.length];
    return `Mind game today (playful, never call it a test). Early in the call say: "Chaliye ek chhota sa khel khelte hain: teen shabd yaad rakhiye: ${set.hi.join(", ")}" (${set.en.join(", ")}). Carry on with the call. Just before goodbye ask her to say the three words. Call log_brain_game with game "word_recall", score = words she remembered (0 to 3), max 3. Cheer whatever she gets. If she doesn't want to play, skip it.`;
  }
  const cat = CATEGORIES[names % CATEGORIES.length];
  return `Mind game today (playful, never call it a test): ask her to name as many ${cat.hi} (${cat.en}) as she can in about 20 seconds, just for fun. Count them out loud with her. Call log_brain_game with game "category_naming", score = how many (stop counting at 15), max 15, detail "${cat.en}". Cheer her on.`;
}

export async function logGame(elder: Elder, a: { game: GameKind; score: number; max: number; detail?: string; call_id?: string }) {
  const max = Math.max(1, Math.min(15, Math.round(a.max)));
  const score = Math.max(0, Math.min(max, Math.round(a.score)));
  const g: GameResult = { elderId: elder.elderId, gameId: newId("gam"), date: localDate(elder.tz), game: a.game, score, max, detail: a.detail?.slice(0, 60), callId: a.call_id, createdAt: nowIso() };
  await getRepo().putGame(g);
  emit("game.logged", elder.familyId, { game: g, label: `🧩 Mind game: ${GAME_LABEL[g.game]} ${score}/${max}` }, elder.elderId);
  const s = await mindSummary(elder);
  const k = s.kinds.find((x) => x.game === g.game);
  if (k?.trend === "dipping") {
    const recent = (await getRepo().listAlerts(elder.familyId)).find((x) => x.type === "mind" && x.elderId === elder.elderId && Date.now() - Date.parse(x.createdAt) < 14 * 86400_000);
    if (!recent) {
      await createAlert({
        elder, severity: "watch", type: "mind",
        title: `Memory games: a small dip for ${elder.preferredName}`,
        body: `${GAME_LABEL[g.game]}: ${k.recentAvg}% over the last few games, down from ${pr(elder).hers} usual ${k.usualAvg}%. Tiredness or a bad night can do this. If it continues for a few weeks, mention it at ${pr(elder).hers} next doctor visit. KaiseHo never diagnoses.`,
        data: { game: g.game, recentAvg: k.recentAvg, usualAvg: k.usualAvg },
      });
    }
  }
  const great = score / max >= 0.67;
  return { ok: true, score, max, say: great ? "Wonderful, sharp as ever!" : "Good effort! It's just for fun, we'll play again another day." };
}

/** Family view: per game, the recent average vs her usual, and a plain-word trend. */
export async function mindSummary(elder: Elder, days = 90) {
  const today = localDate(elder.tz);
  const games = await getRepo().listGames(elder.elderId, addDays(today, -days));
  const kinds = (["word_recall", "category_naming"] as GameKind[]).map((game) => {
    const xs = games.filter((g) => g.game === game);
    const recent = xs.slice(-3).map(pct);
    const usual = xs.slice(0, -3).map(pct);
    const recentAvg = avg(recent), usualAvg = avg(usual);
    let trend: "steady" | "improving" | "dipping" | "new" = "new";
    if (recentAvg !== null && usualAvg !== null && usual.length >= 2) {
      trend = recentAvg <= usualAvg - 20 ? "dipping" : recentAvg >= usualAvg + 15 ? "improving" : "steady";
    }
    return { game, label: GAME_LABEL[game], played: xs.length, recentAvg, usualAvg, trend, points: xs.map((g) => ({ date: g.date, pct: pct(g), score: g.score, max: g.max, detail: g.detail })) };
  });
  const played = games.length;
  const overall = avg(games.slice(-6).map(pct));
  const dipping = kinds.some((k) => k.trend === "dipping");
  return {
    played, overall, kinds,
    headline: played === 0 ? "No games yet: the first one comes in a regular check-in."
      : dipping ? "A small dip lately. Worth watching, not worrying."
      : kinds.some((k) => k.trend === "improving") ? "Sharper than usual lately."
      : `Steady, in line with ${pr(elder).hers} usual.`,
    note: "Playful games in calls, compared only with her own usual. Not a medical test.",
  };
}
