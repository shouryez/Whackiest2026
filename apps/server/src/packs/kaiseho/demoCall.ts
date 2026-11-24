import type { Elder } from "@kaiseho/shared";
import { runTool } from "../../control/tiers";
import { emit } from "../../engine/events";
import { newId } from "../../engine/ids";
import { getRepo } from "../../repo";
import { callElder } from "./calls";
import { kaisehoPostCall } from "./postcall";
import { AGENT_TOOLS } from "./tools";

/**
 * "Play demo call": a scripted check-in that drives the REAL tools, control layer and
 * post-call pipeline (no voice). Used when no ElevenLabs keys are set, and as the stage
 * fallback. Always labelled "simulated" in the UI.
 */
type Step = { say: string; agent?: string; tool?: keyof typeof AGENT_TOOLS; args?: Record<string, unknown> };

const SCRIPT = (withScam: boolean, withEmergency: boolean): Step[] => [
  { agent: "Namaskara Amma! I'm KaiseHo, Ravi's AI helper. How did you sleep?", say: "I slept well, beta. Feeling good today." , tool: "log_wellbeing", args: { mood: 4, sleep: "good" } },
  { agent: "Did you take your Metformin after breakfast?", say: "Yes, I took it after my idli.", tool: "log_medication", args: { med_name: "Metformin 500 mg", slot: "morning", status: "taken" } },
  { agent: "Last time your knee hurt after the temple stairs. Is it better now?", say: "Much better, maybe 3 out of 10.", tool: "log_wellbeing", args: { pain: { where: "knee", level: 3 } } },
  { agent: "And how did Kamala aunty's surgery go?", say: "It went well, she's resting. I'm taking her bisi bele bath on Saturday.", tool: "save_memory", args: { type: "plan", text: "Taking bisi bele bath to Kamala aunty on Saturday after her cataract surgery", follow_up_after_days: 3, importance: 3 } },
  { agent: "Ravi says he'll visit you on Sunday!", say: "Oh, that's wonderful!", tool: "mark_message_delivered", args: { message_id: "msg_ravi_sunday" } },
  ...(withScam ? [{
    agent: "Is there anything else on your mind?",
    say: "Actually, a CBI officer called. He said my Aadhaar is in a money laundering case and I must stay on video call and not tell anyone. He asked for the OTP 482913.",
    tool: "check_scam" as const, args: { description: "A CBI officer called. He said my Aadhaar is in a money laundering case and I must stay on video call and not tell anyone. He asked for the OTP 482913.", channel: "video_call" },
  }] : []),
  ...(withEmergency ? [{ agent: "Are you feeling alright?", say: "My chest is paining and I feel dizzy.", tool: "raise_emergency" as const, args: { kind: "chest_pain", details: "My chest is paining and I feel dizzy" } }] : []),
  { agent: "Would you like me to tell Ravi anything?", say: "Tell him I miss him. Yes, send it.", tool: "send_family_message", args: { text: "I miss you, come soon", elder_consented: true } },
  { agent: "I'll call you tomorrow at 9. Take care, Amma!", say: "Bye, beta." },
];

let running = false;

export async function playDemoCall(elder: Elder, opts: { scam?: boolean; emergency?: boolean; pauseMs?: number } = {}): Promise<{ callId: string }> {
  if (running) throw new Error("a demo call is already playing");
  running = true;
  const pause = opts.pauseMs ?? 2200;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const { call } = await callElder(elder, "daily");
  const conversationId = newId("conv_sim");
  call.conversationId = conversationId;
  call.mode = "simulated";
  await getRepo().putCall(call);

  void (async () => {
    const transcript: { role: string; message: string }[] = [];
    try {
      await sleep(1800);
      for (const step of SCRIPT(opts.scam ?? true, opts.emergency ?? false)) {
        if (step.agent) {
          transcript.push({ role: "agent", message: step.agent });
          emit("tool.called", elder.familyId, { tool: "speech", tier: "T0", label: `🗣️ KaiseHo: “${step.agent}”`, speech: "agent" }, elder.elderId);
          await sleep(pause * 0.6);
        }
        transcript.push({ role: "user", message: step.say });
        emit("tool.called", elder.familyId, { tool: "speech", tier: "T0", label: `👵 ${elder.preferredName}: “${step.say.replace(/\b\d{4,8}\b/g, "••••")}”`, speech: "elder" }, elder.elderId);
        await sleep(pause * 0.5);
        if (step.tool) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await runTool(AGENT_TOOLS[step.tool].spec as any, { elder_id: elder.elderId, call_id: call.callId, ...step.args }, { actor: "agent" });
          await sleep(pause * 0.5);
        }
      }
      await sleep(800);
      await kaisehoPostCall.onTranscript({
        type: "post_call_transcription",
        data: {
          conversation_id: conversationId,
          transcript: transcript,
          metadata: { call_duration_secs: 148 },
          analysis: { transcript_summary: "Simulated demo call", evaluation_criteria_results: { disclosed_ai: { result: "success" }, no_medical_advice: { result: "success" }, no_sensitive_numbers: { result: "success" }, asked_all_meds: { result: "success" } } },
          conversation_initiation_client_data: { dynamic_variables: { elder_id: elder.elderId, call_id: call.callId } },
        },
      });
    } catch (err) {
      console.error("[demo call]", err);
    } finally {
      running = false;
    }
  })();
  return { callId: call.callId };
}
