import { z } from "zod";
import { ScamPattern, ScamVerdict } from "@kaiseho/shared";
import { llmJson } from "../../../engine/llm";
import { scoreScamRules, verdictFor, type RuleResult } from "./rules";

/**
 * Scam Shield, layer 2 (plan.md Section 10.3 / 14.3): LLM classifier with a hard 1.5 s
 * timeout, falling back to rules. Final score = max(rules, llm), +0.1 when both agree it's a scam.
 */
const ClassifierSchema = z.object({
  verdict: ScamVerdict,
  pattern: ScamPattern,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(5),
});

const SYSTEM = `You classify whether an elderly person's description indicates a scam attempt in India.
Patterns: digital_arrest, courier_parcel, kyc_update, electricity_cut, relative_emergency, lottery_prize, safe_account, remote_access, otp_request, investment_scheme, none.
Output JSON {verdict: likely_scam|possible_scam|probably_safe, pattern, confidence: 0-1, reasons: [..]}.
Legitimate look-alikes exist: a real bank branch calling about an FD maturity without asking for OTP, a real courier delivery, a doctor's clinic reminder, a news story about scams.
Never ask for more personal data.`;

export interface ScamResult extends RuleResult {
  layers: { rules: number; llm: number | null };
  reasons: string[];
}

export async function classifyScam(description: string, timeoutMs = 1500): Promise<ScamResult> {
  const rules = scoreScamRules(description);
  const llm = await Promise.race([
    llmJson({ system: SYSTEM, user: description.slice(0, 1500), schema: ClassifierSchema, timeoutMs }),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs + 100)),
  ]);
  if (!llm) return { ...rules, layers: { rules: rules.score, llm: null }, reasons: rules.matched.map((m) => `mentions "${m}"`) };

  const llmScore = llm.verdict === "likely_scam" ? Math.max(0.6, llm.confidence) : llm.verdict === "possible_scam" ? Math.min(0.59, Math.max(0.35, llm.confidence * 0.6)) : Math.min(0.3, (1 - llm.confidence) * 0.3);
  const agree = rules.verdict !== "probably_safe" && llm.verdict !== "probably_safe";
  const score = Math.round(Math.min(0.99, Math.max(rules.score, llmScore) + (agree ? 0.1 : 0)) * 100) / 100;
  const pattern = rules.pattern !== "none" ? rules.pattern : llm.pattern;
  return { ...rules, score, pattern: score > 0 ? pattern : "none", verdict: verdictFor(score), layers: { rules: rules.score, llm: llmScore }, reasons: llm.reasons };
}
