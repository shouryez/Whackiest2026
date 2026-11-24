import type { Call, Elder } from "@kaiseho/shared";
import { env } from "../env";
import { getRepo } from "../repo";
import { emit } from "./events";
import { localDate, newId, nowIso } from "./ids";

/**
 * Ek Call engine: placing calls (plan.md Section 12.2). Pack-agnostic: the pack passes in
 * a context builder. Without ElevenLabs keys the call runs in "simulated" mode (clearly
 * labelled on the dashboard) so the pipeline is demoable; `pnpm simulate` drives it.
 */
export type ContextBuilder = (elder: Elder, reason: string, callId: string, extras: Record<string, string>) => Promise<Record<string, string>>;

export function elevenLabsReady(agentId = env.ELEVENLABS_AGENT_ID): boolean {
  return Boolean(env.ELEVENLABS_API_KEY && agentId && env.ELEVENLABS_PHONE_NUMBER_ID);
}

export function makeCallId(tz: string): string {
  const d = localDate(tz).replace(/-/g, "");
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "");
  return `call_${d}_${t}_${newId("x").slice(2, 6)}`;
}

interface OutboundResult { conversationId?: string; callSid?: string }

/** ElevenLabs outbound call via the native Twilio integration. Verify field names against the API reference. */
export async function placeOutboundCall(opts: { agentId: string; toNumber: string; dynamicVariables: Record<string, string> }): Promise<OutboundResult> {
  const res = await fetch(`${env.ELEVENLABS_API_BASE}/v1/convai/twilio/outbound-call`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: opts.agentId,
      agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: opts.toNumber,
      conversation_initiation_client_data: { dynamic_variables: opts.dynamicVariables },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; conversation_id?: string; callSid?: string; message?: string };
  if (!res.ok || body.success === false) throw new Error(`outbound call failed: ${res.status} ${body.message ?? ""}`.trim());
  return { conversationId: body.conversation_id, callSid: body.callSid };
}

export async function startCall(opts: {
  elder: Elder;
  reason: string;
  extras?: Record<string, string>;
  attempt?: number;
  buildContext: ContextBuilder;
  onFailure?: (call: Call, err: Error) => Promise<void>;
}): Promise<{ call: Call; dynamicVariables: Record<string, string> }> {
  const repo = getRepo();
  const { elder, reason } = opts;
  const callId = makeCallId(elder.tz);
  const dynamicVariables = await opts.buildContext(elder, reason, callId, opts.extras ?? {});
  const live = elevenLabsReady();
  const call: Call = {
    elderId: elder.elderId, callId, reason, status: "ringing", attempt: opts.attempt ?? 1,
    startedAt: nowIso(), familyMessagesSent: 0, mode: live ? "live" : "simulated",
  };
  await repo.putCall(call);
  emit("call.ringing", elder.familyId, { callId, reason, mode: call.mode, attempt: call.attempt, to: elder.preferredName }, elder.elderId);

  if (live) {
    try {
      const r = await placeOutboundCall({ agentId: env.ELEVENLABS_AGENT_ID!, toNumber: elder.phone, dynamicVariables });
      call.conversationId = r.conversationId;
      call.callSid = r.callSid;
      await repo.putCall(call);
    } catch (err) {
      call.status = "failed";
      call.endedAt = nowIso();
      await repo.putCall(call);
      emit("call.ended", elder.familyId, { callId, status: "failed", error: (err as Error).message }, elder.elderId);
      await opts.onFailure?.(call, err as Error);
    }
  }
  return { call, dynamicVariables };
}

/** First tool use or webhook marks the call live (works for phone, browser test and simulated calls). */
export async function markInProgress(elderId: string, callId: string, familyId: string, mode: Call["mode"] = "browser"): Promise<Call> {
  const repo = getRepo();
  let call = await repo.getCall(elderId, callId);
  if (!call) {
    call = { elderId, callId, reason: "daily", status: "in_progress", attempt: 1, startedAt: nowIso(), familyMessagesSent: 0, mode };
    await repo.putCall(call);
    emit("call.in_progress", familyId, { callId, mode }, elderId);
  } else if (call.status === "ringing" || call.status === "scheduled") {
    call.status = "in_progress";
    await repo.putCall(call);
    emit("call.in_progress", familyId, { callId, mode: call.mode }, elderId);
  }
  return call;
}
