import { z } from "zod";
import { env } from "../env";
import { verifyElevenLabs } from "./webhooks/verify";

/**
 * Ek Call post-call webhook (plan.md Section 8.6), pack-agnostic part:
 * verify HMAC → parse → hand off to the pack asynchronously (return 200 fast).
 * We never request audio: only the transcription and call-initiation-failure events.
 */
const TranscriptTurn = z.object({ role: z.string(), message: z.string().nullable().optional(), time_in_call_secs: z.number().optional() }).passthrough();

export const PostCallPayload = z.object({
  type: z.string(),
  event_timestamp: z.number().optional(),
  data: z.object({
    agent_id: z.string().optional(),
    conversation_id: z.string(),
    status: z.string().optional(),
    transcript: z.array(TranscriptTurn).optional().default([]),
    metadata: z.object({ call_duration_secs: z.number().optional() }).passthrough().optional(),
    analysis: z.object({
      transcript_summary: z.string().optional(),
      data_collection_results: z.record(z.string(), z.object({ value: z.unknown() }).passthrough()).optional(),
      evaluation_criteria_results: z.record(z.string(), z.object({ result: z.string() }).passthrough()).optional(),
    }).passthrough().optional(),
    conversation_initiation_client_data: z.object({ dynamic_variables: z.record(z.string(), z.unknown()).optional() }).passthrough().optional(),
    failure_reason: z.string().optional(),
  }).passthrough(),
});
export type PostCallPayload = z.infer<typeof PostCallPayload>;

export interface PostCallHooks {
  onTranscript(p: PostCallPayload): Promise<void>;
  onInitiationFailure(p: PostCallPayload): Promise<void>;
}

export async function handleElevenLabsWebhook(raw: string, signature: string | undefined, hooks: PostCallHooks): Promise<{ status: number; body: Record<string, unknown> }> {
  if (env.ELEVENLABS_WEBHOOK_SECRET) {
    const v = verifyElevenLabs(env.ELEVENLABS_WEBHOOK_SECRET, raw, signature);
    if (!v.ok) return { status: 401, body: { error: v.reason } };
  } else if (!env.DEMO_MODE) {
    return { status: 401, body: { error: "webhook secret not configured" } };
  }
  let parsed: PostCallPayload;
  try {
    parsed = PostCallPayload.parse(JSON.parse(raw));
  } catch {
    return { status: 400, body: { error: "bad payload" } };
  }
  const job =
    parsed.type === "post_call_transcription" ? hooks.onTranscript(parsed)
    : parsed.type === "call_initiation_failure" ? hooks.onInitiationFailure(parsed)
    : Promise.resolve(); // post_call_audio etc. are ignored on purpose (no audio stored)
  job.catch((err) => console.error("[postcall]", err));
  return { status: 200, body: { ok: true } };
}
