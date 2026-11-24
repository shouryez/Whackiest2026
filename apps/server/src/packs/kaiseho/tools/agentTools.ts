import { z } from "zod";
import { MedStatus, MemoryType, Slot, type Lang } from "@kaiseho/shared";
import type { ToolSpec } from "../../../control/tiers";
import { redactPII } from "../../../control/redact";
import { addDays, localDate, newId, nowIso } from "../../../engine/ids";
import { getRepo } from "../../../repo";
import { createAlert } from "../alerts";
import { adviceFor } from "../scam/advice";
import { scoreScamRules } from "../scam/rules";

/**
 * Agent tools for /mcp/agent (plan.md Section 10.1). Phase 0 set:
 * log_medication, log_wellbeing, save_memory, check_scam (rules only), send_family_message.
 * Every tool takes elder_id (+ call_id) from the agent's dynamic variables.
 */

export interface AgentTool<S extends z.ZodRawShape> {
  description: string;
  shape: S;
  spec: ToolSpec<z.infer<z.ZodObject<S>>>;
}

const elder_id = z.string().describe("The elder_id from your instructions. Never say it aloud.");
const call_id = z.string().describe("The call_id from your instructions.");

async function ensureCall(elderId: string, callId: string) {
  const repo = getRepo();
  const existing = await repo.getCall(elderId, callId);
  if (existing) return existing;
  // Browser test calls / calls started outside the engine: register them on first tool use.
  const call = { elderId, callId, reason: "daily", status: "in_progress" as const, attempt: 1, startedAt: nowIso(), familyMessagesSent: 0 };
  await repo.putCall(call);
  return call;
}

// ---------------- log_medication (T1) ----------------
const logMedicationShape = {
  elder_id, call_id,
  med_id: z.string().optional().describe("From med_ids if known"),
  med_name: z.string().describe("Medicine name as asked, e.g. 'Metformin 500 mg'"),
  slot: Slot,
  status: MedStatus,
  note: z.string().max(200).optional(),
};
export const log_medication: AgentTool<typeof logMedicationShape> = {
  description: "Log whether the elder took a due medicine (taken / missed / unsure). Call once per medicine asked about.",
  shape: logMedicationShape,
  spec: {
    name: "log_medication",
    tier: "T1",
    label: (a) => `💊 Logged ${a.med_name} (${a.slot}): ${a.status === "taken" ? "taken ✓" : a.status === "missed" ? "missed ✗" : "not sure ?"}`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active);
      const name = a.med_name.toLowerCase();
      const med = meds.find((m) => m.medId === a.med_id) ?? meds.find((m) => name.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(name.split(" ")[0]));
      const date = localDate(elder.tz);
      const medId = med?.medId ?? `adhoc_${name.replace(/\W+/g, "_").slice(0, 20)}`;
      await repo.putMedLog({
        elderId: elder.elderId, sk: `${date}#${medId}#${a.slot}`, date, medId, medName: med ? `${med.name} ${med.dose}` : a.med_name,
        slot: a.slot, status: a.status, callId: a.call_id, note: a.note ? redactPII(a.note) : undefined, loggedAt: nowIso(),
      });
      if (med && a.status === "taken" && typeof med.stockCount === "number") {
        med.stockCount = Math.max(0, med.stockCount - 1);
        await repo.putMedication(med);
      }
      const due = meds.reduce((n, m) => n + m.slots.length, 0);
      const taken = (await repo.listMedLogs(elder.elderId, date)).filter((l) => l.date === date && l.status === "taken").length;
      return { ok: true, adherence_today: `${taken}/${due}` };
    },
  },
};

// ---------------- log_wellbeing (T1) ----------------
const logWellbeingShape = {
  elder_id, call_id,
  mood: z.number().int().min(1).max(5).optional().describe("1 very low … 5 very good"),
  sleep: z.enum(["good", "ok", "poor"]).optional(),
  pain: z.object({ where: z.string().max(60), level: z.number().int().min(0).max(10) }).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  appetite: z.enum(["good", "low"]).optional(),
  note: z.string().max(200).optional(),
};
export const log_wellbeing: AgentTool<typeof logWellbeingShape> = {
  description: "Log how the elder is today: mood 1-5, sleep, pain (where + 0-10), energy, appetite. Call whenever you learn any of these; repeated calls merge.",
  shape: logWellbeingShape,
  spec: {
    name: "log_wellbeing",
    tier: "T1",
    label: (a) => {
      const parts = [
        a.mood !== undefined ? `mood ${a.mood}/5` : "",
        a.sleep ? `slept ${a.sleep}` : "",
        a.pain ? `${a.pain.where} pain ${a.pain.level}/10` : "",
        a.energy !== undefined ? `energy ${a.energy}/5` : "",
        a.appetite ? `appetite ${a.appetite}` : "",
      ].filter(Boolean);
      return `🙂 Logged wellbeing: ${parts.join(" · ") || "note"}`;
    },
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const prev = await repo.getCheckIn(elder.elderId, a.call_id);
      await repo.putCheckIn({
        elderId: elder.elderId, callId: a.call_id, date: localDate(elder.tz),
        mood: a.mood ?? prev?.mood, sleep: a.sleep ?? prev?.sleep, pain: a.pain ?? prev?.pain,
        energy: a.energy ?? prev?.energy, appetite: a.appetite ?? prev?.appetite,
        notes: [prev?.notes, a.note ? redactPII(a.note) : undefined].filter(Boolean).join(" · ") || undefined,
        updatedAt: nowIso(),
      });
      return { ok: true };
    },
  },
};

// ---------------- save_memory (T1) ----------------
const saveMemoryShape = {
  elder_id, call_id,
  type: MemoryType,
  text: z.string().min(2).max(300).describe("One short factual sentence, e.g. 'Knee pain after climbing temple stairs'"),
  follow_up_after_days: z.number().int().min(0).max(60).optional().describe("Ask about it again after N days"),
  private: z.boolean().optional().describe("true if the elder asked not to tell family"),
  importance: z.number().int().min(1).max(5).optional(),
};
export const save_memory: AgentTool<typeof saveMemoryShape> = {
  description: "Remember something important the elder said (people, events, health complaints, plans, likes) so the next call can follow up. Use private=true if they asked you not to tell family.",
  shape: saveMemoryShape,
  spec: {
    name: "save_memory",
    tier: "T1",
    label: (a) => (a.private ? `🔒 Saved a private memory (${a.type}), hidden from family` : `🧠 Memory (${a.type}): ${a.text.slice(0, 70)}`),
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const today = localDate(elder.tz);
      const memoryId = newId("mem");
      await repo.putMemory({
        elderId: elder.elderId, memoryId, type: a.type, text: redactPII(a.text), importance: a.importance ?? 3,
        private: a.private ?? false,
        followUpAfter: a.follow_up_after_days !== undefined ? addDays(today, a.follow_up_after_days) : undefined,
        followUpDone: false, source: "tool", lastMentionedAt: nowIso(), createdAt: nowIso(),
      });
      return { ok: true, memory_id: memoryId };
    },
  },
};

// ---------------- check_scam (T3) ----------------
const checkScamShape = {
  elder_id, call_id,
  description: z.string().min(3).max(1500).describe("What the elder said about the suspicious call/message, in their words"),
  channel: z.enum(["call", "video_call", "sms", "whatsapp", "in_person"]).optional(),
};
export const check_scam: AgentTool<typeof checkScamShape> = {
  description: "IMMEDIATELY call this when the elder mentions police/CBI/ED/customs, a courier or parcel, arrest, video-call verification, KYC, power cut tonight, lottery/prize, a relative needing money urgently, an RBI safe account, screen-sharing apps, OTP requests, or being told to keep it secret. Returns a verdict and calm advice; alerts family automatically when needed.",
  shape: checkScamShape,
  spec: {
    name: "check_scam",
    tier: "T3",
    label: (a, r) => `🛡️ SCAM CHECK → ${String(r.verdict).replace("_", " ")} · ${String(r.pattern).replace("_", " ")} · ${r.score}`,
    run: async (a, { elder }) => {
      await ensureCall(elder.elderId, a.call_id);
      const rules = scoreScamRules(a.description);
      // Layer 2 (LLM classifier, 1.5 s timeout) arrives in Phase 3; rules-only for now.
      const lang: Lang = elder.primaryLanguage;
      const advice = adviceFor(rules.pattern, lang);
      let familyAlerted = false;
      if (rules.score >= 0.6) {
        // T3 safety override: alerts family regardless of privacy preferences.
        familyAlerted = true;
        const story = redactPII(a.description).slice(0, 220);
        await createAlert({
          elder,
          severity: "urgent",
          type: "scam",
          title: "Scam attempt blocked",
          body: `${elder.preferredName} told KaiseHo: "${story}"`,
          data: { pattern: rules.pattern, score: rules.score, matched: rules.matched, channel: a.channel, callId: a.call_id },
          telegramLines: [
            `Pattern: ${rules.pattern.replace("_", " ")} (score ${rules.score})`,
            `✅ KaiseHo told her it's a scam: don't send money, don't share numbers, hang up.`,
            `👉 Please call her today. Cyber-fraud helpline: 1930`,
          ],
        });
      }
      return {
        verdict: rules.verdict,
        pattern: rules.pattern,
        score: rules.score,
        family_alerted: familyAlerted,
        advice_short: advice,
      };
    },
  },
};

// ---------------- send_family_message (T2) ----------------
const sendFamilyMessageShape = {
  elder_id, call_id,
  text: z.string().min(1).max(400).describe("The elder's message, in their words"),
  to: z.enum(["primary", "all"]).optional(),
  urgency: z.enum(["normal", "soon"]).default("normal"),
  elder_consented: z.boolean().describe("Must be true: only send after the elder said yes to sending it"),
};
export const send_family_message: AgentTool<typeof sendFamilyMessageShape> = {
  description: "Send a message from the elder to their family (e.g. 'Tell Ravi I miss him'). Only after the elder agreed; set elder_consented=true. Max 5 per call.",
  shape: sendFamilyMessageShape,
  spec: {
    name: "send_family_message",
    tier: "T2",
    label: (a, r) => `✉️ Message to ${(r.sent_to as string[] | undefined)?.join(", ") || "family"}: "${a.text.slice(0, 60)}"`,
    run: async (a, { elder }) => {
      const repo = getRepo();
      await ensureCall(elder.elderId, a.call_id);
      const text = redactPII(a.text);
      await repo.putMessage({
        elderId: elder.elderId, messageId: newId("msg"), direction: "from_elder", fromName: elder.preferredName,
        text, delivered: true, deliveredAt: nowIso(), createdAt: nowIso(),
      });
      const members = (await repo.listMembers(elder.familyId)).filter((m) => m.role !== "neighbour");
      const to = a.to === "all" ? members : members.filter((m) => m.role === "primary");
      await createAlert({
        elder,
        severity: a.urgency === "soon" ? "urgent" : "info",
        type: "message",
        title: `Message from ${elder.preferredName}`,
        body: text,
        data: { to: to.map((m) => m.name), callId: a.call_id },
        telegramLines: ["💬 Sent with her permission during today's check-in."],
      });
      return { ok: true, sent_to: to.map((m) => m.name) };
    },
  },
};

export const AGENT_TOOLS = { log_medication, log_wellbeing, save_memory, check_scam, send_family_message };
