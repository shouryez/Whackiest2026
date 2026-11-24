import type { Elder, Tier } from "@kaiseho/shared";
import { emit } from "../engine/events";
import { getRepo } from "../repo";
import { writeAudit } from "./audit";
import { redactDeep } from "./redact";

/**
 * Risk tiers (plan.md Section 6.2) — enforced by the server, not the prompt.
 * Every MCP tool runs through runTool():
 *   validate (zod, done by the MCP SDK) → scope check → tier rules → work → audit → live event → short result.
 */

export class ToolRejected extends Error {
  constructor(public reason: string, public hint = "continue the conversation") {
    super(reason);
  }
}

export interface ToolContext {
  actor: string; // "agent" | `family:<memberId>`
  /** Family scope for /mcp/family callers; undefined for the agent door (elder scope only). */
  familyId?: string;
}

export interface ToolSpec<A extends Record<string, unknown>> {
  name: string;
  tier: Tier;
  /** Human label for Live Ops, e.g. "Logged Metformin: taken ✓". */
  label: (args: A, result: Record<string, unknown>) => string;
  run: (args: A, ctx: { elder: Elder; actor: string }) => Promise<Record<string, unknown>>;
}

// ---- T2 rate limits ----
const T2_LIMITS: Record<string, { perCall?: number; perDay?: number }> = {
  send_family_message: { perCall: 5 },
  call_now: { perDay: 3 },
};
const counters = new Map<string, number>();
function bump(key: string, limit: number): void {
  const n = (counters.get(key) ?? 0) + 1;
  if (n > limit) throw new ToolRejected("rate limit reached for this action");
  counters.set(key, n);
}
export function resetRateLimits(): void {
  counters.clear();
}

function enforceTier(name: string, tier: Tier, args: Record<string, unknown>, elder: Elder): void {
  if (tier === "T2") {
    const lim = T2_LIMITS[name];
    const callId = typeof args.call_id === "string" ? args.call_id : "nocall";
    if (lim?.perCall) bump(`${name}#${elder.elderId}#${callId}`, lim.perCall);
    if (lim?.perDay) bump(`${name}#${elder.elderId}#${new Date().toISOString().slice(0, 10)}`, lim.perDay);
    // Non-safety messages to family need the elder's explicit yes.
    if (name === "send_family_message" && args.elder_consented !== true) {
      throw new ToolRejected("elder consent missing", "ask the elder if they want this message sent, then retry with elder_consented=true");
    }
  }
  // T0/T1: auto. T3: auto, overrides privacy (handled inside the tool).
}

const MAX_RESULT_CHARS = 400;

export async function runTool<A extends Record<string, unknown>>(
  spec: ToolSpec<A>,
  args: A,
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const started = Date.now();
  const elderId = String(args.elder_id ?? "");
  const callId = typeof args.call_id === "string" ? args.call_id : undefined;
  const repo = getRepo();
  const elder = await repo.getElder(elderId);

  const reject = async (reason: string, hint: string, familyId = elder?.familyId ?? "unknown") => {
    await writeAudit({ elderId: elderId || "unknown", actor: ctx.actor, tool: spec.name, tier: spec.tier, args, resultSummary: `rejected: ${reason}`, ok: false, callId });
    emit("tool.rejected", familyId, { tool: spec.name, tier: spec.tier, reason, actor: ctx.actor }, elderId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, reason, hint }) }], isError: true };
  };

  // Scope: the elder must exist, and family callers may only touch their own elders.
  if (!elder) return reject("unknown elder", "continue the conversation");
  if (ctx.familyId && elder.familyId !== ctx.familyId) return reject("not in your family", "only your family's elders are accessible");

  try {
    enforceTier(spec.name, spec.tier, args, elder);
    const result = await spec.run(args, { elder, actor: ctx.actor });
    let text = JSON.stringify(result);
    // Voice latency: the agent door gets short results; the family door (Claude) gets full ones.
    const max = ctx.actor === "agent" ? MAX_RESULT_CHARS : 6000;
    if (text.length > max) text = text.slice(0, max - 3) + "...";
    const label = spec.label(args, result);
    await writeAudit({ elderId, actor: ctx.actor, tool: spec.name, tier: spec.tier, args, resultSummary: label, ok: true, callId });
    emit(
      "tool.called",
      elder.familyId,
      { tool: spec.name, tier: spec.tier, label, actor: ctx.actor, ms: Date.now() - started, args: redactDeep(args), result: redactDeep(result) },
      elderId,
    );
    return { content: [{ type: "text", text }] };
  } catch (err) {
    if (err instanceof ToolRejected) return reject(err.reason, err.hint);
    console.error(`[tool ${spec.name}]`, err);
    return reject("internal error", "continue the conversation");
  }
}
