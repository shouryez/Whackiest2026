/**
 * Scam Shield evaluation (plan.md Section 20). Prints a markdown table for the PPT.
 *   pnpm eval:scam
 * "Detected" = verdict likely_scam (the threshold that alerts the family).
 */
import { readFileSync } from "node:fs";
import { scoreScamRules } from "../apps/server/src/packs/kaiseho/scam/rules";

interface Case { text: string; scam: boolean; pattern?: string; lang: string }
const cases: Case[] = JSON.parse(readFileSync(new URL("./fixtures/scam_cases.json", import.meta.url), "utf8"));

let tp = 0, fp = 0, fn = 0, tn = 0, patternOk = 0;
const misses: string[] = [];
const byLang = new Map<string, { n: number; ok: number }>();
const t0 = performance.now();

for (const c of cases) {
  const r = scoreScamRules(c.text);
  const flagged = r.verdict === "likely_scam";
  const ok = flagged === c.scam;
  if (c.scam && flagged) { tp++; if (r.pattern === c.pattern) patternOk++; }
  else if (!c.scam && flagged) fp++;
  else if (c.scam && !flagged) fn++;
  else tn++;
  if (!ok) misses.push(`${c.scam ? "MISSED" : "FALSE ALARM"} [${c.lang}] score ${r.score} (${r.pattern}): ${c.text}`);
  const l = byLang.get(c.lang) ?? { n: 0, ok: 0 };
  l.n++; if (ok) l.ok++; byLang.set(c.lang, l);
}
const ms = (performance.now() - t0) / cases.length;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log(`\n## Scam Shield (rules layer) on ${cases.length} cases (${tp + fn} scams, ${tn + fp} legit look-alikes)\n`);
console.log("| Metric | Value | Target |");
console.log("|---|---|---|");
console.log(`| Recall | ${pct(tp / (tp + fn))} | ≥ 90% |`);
console.log(`| Precision | ${pct(tp / Math.max(1, tp + fp))} | ≥ 85% |`);
console.log(`| False alarms | ${fp} / ${tn + fp} | low |`);
console.log(`| Correct pattern (of detected) | ${pct(patternOk / Math.max(1, tp))} | |`);
console.log(`| Avg latency | ${ms.toFixed(2)} ms | < 5 ms |`);
console.log("\n| Language | Accuracy |\n|---|---|");
for (const [lang, v] of byLang) console.log(`| ${lang} | ${v.ok}/${v.n} |`);
if (misses.length) console.log(`\nErrors:\n${misses.map((m) => `- ${m}`).join("\n")}`);
