/**
 * Shared types and constants for KaiseHo / Ek Call.
 * Section 11 (data model) and Section 6.2 (risk tiers) of plan.md are the contract.
 * Do not rename fields without updating plan.md first.
 */
import { z } from "zod";

// ---------- enums ----------
export const Slot = z.enum(["morning", "afternoon", "evening", "night"]);
export type Slot = z.infer<typeof Slot>;

export const MedStatus = z.enum(["taken", "missed", "unsure"]);
export type MedStatus = z.infer<typeof MedStatus>;

export const Severity = z.enum(["info", "watch", "urgent", "emergency"]);
export type Severity = z.infer<typeof Severity>;

export const AlertType = z.enum([
  "scam", "emergency", "no_answer", "missed_meds", "low_mood", "refill", "pause", "message", "health_change", "appointment",
  "pension", "occasion", "vital", "need",
]);
export type AlertType = z.infer<typeof AlertType>;

export const MemoryType = z.enum(["person", "event", "health", "preference", "story", "plan"]);
export type MemoryType = z.infer<typeof MemoryType>;

export const ScamPattern = z.enum([
  "digital_arrest", "courier_parcel", "kyc_update", "electricity_cut", "relative_emergency",
  "lottery_prize", "safe_account", "remote_access", "otp_request", "investment_scheme", "none",
]);
export type ScamPattern = z.infer<typeof ScamPattern>;

export const ScamVerdict = z.enum(["likely_scam", "possible_scam", "probably_safe"]);
export type ScamVerdict = z.infer<typeof ScamVerdict>;

export type Lang = "en" | "hi" | "kn";

// ---------- risk tiers (Section 6.2) ----------
export const TIERS = ["T0", "T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  T0: "Read",
  T1: "Log",
  T2: "Outward",
  T3: "Safety override",
};

// ---------- entities (Section 11) ----------
export interface Family {
  familyId: string;
  name: string;
  createdAt: string;
  familyTokenHash?: string;
  settings: { quietHours?: { start: string; end: string }; digestDay: string; digestTime: string };
}

export interface Member {
  familyId: string;
  memberId: string;
  name: string;
  relation: "son" | "daughter" | "spouse" | "neighbour" | "other";
  phone?: string;
  telegramChatId?: string;
  role: "primary" | "secondary" | "neighbour";
  alertLevels: Severity[];
  language: Lang;
}

export interface Elder {
  elderId: string;
  familyId: string;
  name: string;
  preferredName: string;
  gender?: string;
  age?: number;
  languages: Lang[];
  primaryLanguage: Lang;
  phone: string;
  city: string;
  lat?: number;
  lon?: number;
  address?: string;
  tz: string;
  callTimeLocal: string;
  callDays: number[];
  conditions: string[];
  /** pending_consent: onboarded by family, no daily calls until the elder says yes in the consent call. */
  status: "active" | "paused" | "stopped" | "pending_consent";
  pausedUntil?: string;
  privacy: { shareMedicines: boolean; shareWellbeing: boolean; shareMemories: boolean };
  consentId?: string;
  /** Clinics the family has added (for the clinic-calling agent). */
  clinics?: Clinic[];
  /** Pension life certificate (Jeevan Pramaan), due every November (plan.md P2-9). */
  pension?: PensionInfo;
  /** Emergency health card (QR for neighbours / paramedics). */
  allergies?: string[];
  bloodGroup?: string;
  cardToken?: string;
  /** Readings she checks at home and can tell KaiseHo by voice. */
  vitalsTracked?: VitalKind[];
  /** Her doctor's ranges (defaults are general adult ranges, not medical advice). */
  vitalTargets?: Partial<VitalTargets>;
  /** LPG cylinder: last refill date and her usual interval, to ask before it runs out. */
  gas?: { lastRefill?: string; intervalDays?: number };
  createdAt: string;
}

export interface Medication {
  elderId: string;
  medId: string;
  name: string;
  dose: string;
  slots: Slot[];
  withFood?: "before" | "after" | "any";
  startDate: string;
  endDate?: string;
  stockCount?: number;
  refillThresholdDays?: number;
  active: boolean;
  addedBy: string;
  /** Critical medicines get a short follow-up call when a dose isn't taken yet. */
  critical?: boolean;
}

export interface MedLog {
  elderId: string;
  sk: string; // `${date}#${medId}#${slot}`
  date: string;
  medId: string;
  medName: string;
  slot: Slot;
  status: MedStatus;
  callId: string;
  note?: string;
  loggedAt: string;
}

export interface CheckIn {
  elderId: string;
  callId: string;
  date: string;
  mood?: number;
  sleep?: "good" | "ok" | "poor";
  pain?: { where: string; level: number };
  energy?: number;
  appetite?: "good" | "ok" | "low";
  /** Who she saw or spoke to today (from natural conversation, not a rating). */
  social?: "met_people" | "phone_only" | "alone";
  /** Did she step out or move about today. */
  activity?: "went_out" | "active_home" | "rested";
  /** One good moment she shared ("the jasmine bloomed"). */
  highlight?: string;
  notes?: string;
  /** Weekly scam "vaccine" drill asked in this call (plan.md P2-7). */
  scamDrill?: { id: string; question: string; passed: boolean; answer?: string };
  updatedAt: string;
}

export type CallReason = "daily" | "consent" | "reminder" | "callback" | "followup" | "checkin" | "message" | "briefing";

export interface CallSummary {
  family_en: string;
  family_native: string;
  highlights: string[];
  flags: { type: string; severity: "watch" | "urgent"; evidence: string }[];
  mood?: number;
  source: "llm" | "rules";
}

export interface Call {
  elderId: string;
  callId: string;
  reason: string;
  status: "scheduled" | "ringing" | "in_progress" | "completed" | "no_answer" | "failed";
  attempt: number;
  conversationId?: string;
  callSid?: string;
  startedAt?: string;
  endedAt?: string;
  durationSec?: number;
  familyMessagesSent: number;
  /** "live" = placed through ElevenLabs; "simulated" = no keys configured (dev/demo). */
  mode?: "live" | "simulated" | "browser";
  summary?: CallSummary;
  qualityChecks?: Record<string, boolean>;
  /** Voice vitality from turn timings: speaking pace and how long she takes to reply. */
  voice?: { wpm: number; replyGapSec: number; turns: number };
}

export interface Turn {
  callId: string;
  elderId: string;
  idx: number;
  role: "agent" | "elder";
  text: string; // always redacted
  purgeAt: string;
}

export interface Consent {
  elderId: string;
  consentId: string;
  callId: string;
  dailyCalls: boolean;
  preferredTime?: string;
  shareMedicines: boolean;
  shareWellbeing: boolean;
  shareMemories: boolean;
  notes?: string;
  recordedAt: string;
}

export interface Reminder {
  elderId: string;
  reminderId: string;
  kind: "reminder" | "callback";
  text: string;
  whenUtc: string;
  status: "scheduled" | "done" | "cancelled";
  createdAt: string;
  /** "elder" (asked in a call) or "family:<memberId>". */
  createdBy?: string;
}

export type VitalKind = "sugar" | "bp" | "weight" | "spo2" | "temperature";
export interface VitalTargets {
  sugarFasting: [number, number];
  sugarAfterFood: [number, number];
  bpSystolic: [number, number];
  bpDiastolic: [number, number];
  spo2Min: number;
}
/** A home reading she tells KaiseHo ("sugar was 140 this morning", "BP 150 by 90"). */
export interface Vital {
  elderId: string;
  vitalId: string;
  kind: VitalKind;
  value: number;
  /** Diastolic for BP. */
  value2?: number;
  unit: string;
  context?: "fasting" | "after_food" | "random" | "morning" | "evening";
  date: string;
  measuredAt: string;
  status: "normal" | "high" | "low" | "very_high" | "very_low";
  source: "voice" | "family";
  callId?: string;
}

export type NeedCategory = "groceries" | "medicine" | "gas" | "household" | "repair" | "other";
/** Household needs she mentions ("atta is finishing", "the cylinder is low"); a sibling claims it. */
export interface Need {
  elderId: string;
  familyId: string;
  needId: string;
  item: string;
  category: NeedCategory;
  urgency: "normal" | "soon";
  status: "open" | "claimed" | "done";
  claimedBy?: string;
  /** What the elder has already been told ("claimed" = someone is arranging it, "done"). */
  elderToldStatus?: "claimed" | "done";
  createdAt: string;
  updatedAt: string;
  source: "voice" | "family";
}

export type LifeCertStatus = "pending" | "done" | "not_yet" | "needs_help";
export interface PensionInfo {
  pensioner: boolean;
  /** Where the pension is credited, e.g. "SBI, Mysuru main branch" (never an account number). */
  disbursedBy?: string;
  kind?: "central" | "state" | "defence" | "epfo" | "bank" | "other";
  /** Status for the current year's life certificate. */
  lifeCert?: { year: number; status: LifeCertStatus; method?: string; updatedAt: string; askedOn?: string };
}

export type OccasionKind = "birthday" | "anniversary" | "festival" | "other";
/** Family occasions (plan.md P2-10). Festivals come from festivals.json, not from this table. */
export interface Occasion {
  familyId: string;
  occasionId: string;
  /** The elder it matters to; undefined = every elder in the family. */
  elderId?: string;
  title: string; // "Aarav's birthday"
  kind: OccasionKind;
  /** "MM-DD" repeats every year; "YYYY-MM-DD" happens once. */
  date: string;
  person?: string; // "Aarav"
  relation?: string; // "grandson"
  /** True when the occasion is the elder's own (her birthday): KaiseHo wishes her, family is nudged. */
  isElders?: boolean;
  wishedYears?: number[];
  familyToldYears?: number[];
  createdBy: string;
  createdAt: string;
}

export interface FamilyCall {
  familyId: string;
  elderId: string;
  id: string;
  by: string; // member name
  source: "button" | "elder_mentioned";
  at: string;
}

export interface Clinic {
  clinicId: string;
  name: string;
  doctor: string;
  phone: string;
}

export type AppointmentStatus = "requested" | "calling" | "confirmed" | "no_slot" | "failed" | "cancelled";

/** Clinic-calling agent (plan.md P2-14): KaiseHo calls the clinic on the elder's behalf. */
export interface Appointment {
  elderId: string;
  familyId: string;
  appointmentId: string;
  clinicId: string;
  clinicName: string;
  doctor: string;
  preferred: string; // "Thursday morning" in the elder's words
  reason: string; // only ever "follow-up visit"-level detail is shared with the clinic
  status: AppointmentStatus;
  slotLocalIso?: string;
  slotSpoken?: string;
  notes?: string;
  requestedBy: string; // "elder" | "family:<memberId>"
  mode?: "live" | "simulated";
  createdAt: string;
  updatedAt: string;
}

export interface Digest {
  familyId: string;
  elderId: string;
  digestId: string;
  weekStart: string;
  weekEnd: string;
  script: string;
  audio?: { file: string; bytes: number; voice: string };
  source: "llm" | "rules";
  createdAt: string;
  sentVia: string[];
}

export interface Nudge {
  elderId: string;
  nudgeId: string;
  text: string; // "Amma sounded low 3 days in a row. Call her tonight?"
  reason: string;
  starters: { starter: string; why: string }[];
  createdAt: string;
  status: "open" | "done";
}

export interface Memory {
  elderId: string;
  memoryId: string;
  type: MemoryType;
  text: string;
  importance: number;
  private: boolean;
  followUpAfter?: string;
  followUpDone?: boolean;
  source: "tool" | "postcall";
  lastMentionedAt: string;
  createdAt: string;
}

export interface Alert {
  familyId: string;
  alertId: string;
  elderId: string;
  severity: Severity;
  type: AlertType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: "open" | "acked" | "resolved";
  ackedBy?: string;
  createdAt: string;
  notifiedVia: string[];
}

export interface Message {
  elderId: string;
  messageId: string;
  direction: "to_elder" | "from_elder";
  fromName: string;
  text: string;
  /** Voice notes (grandchildren): audio kept for the family; the transcript is what KaiseHo says in the call. */
  kind?: "text" | "voice";
  audioKey?: string;
  relation?: string;
  delivered: boolean;
  deliveredAt?: string;
  createdAt: string;
}

export interface Audit {
  elderId: string;
  sk: string;
  ts: string;
  actor: string; // "agent" | `family:${memberId}` | "system"
  tool: string;
  tier: Tier;
  argsRedacted: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
  callId?: string;
}

export type LiveEventType =
  | "call.scheduled" | "call.ringing" | "call.in_progress" | "call.ended"
  | "tool.called" | "tool.rejected"
  | "alert.created" | "alert.notified" | "alert.acked"
  | "summary.ready" | "digest.ready" | "briefing.calling" | "demo.reset"
  | "nudge.created" | "family_call.logged" | "schedule.updated" | "message.queued" | "appointment.updated" | "need.updated" | "vital.logged";

export interface LiveEvent {
  id: number;
  ts: string;
  familyId: string;
  elderId?: string;
  type: LiveEventType;
  payload: Record<string, unknown>;
}

// ---------- helplines (Section 6.6) ----------
export const HELPLINES = {
  emergency: "112",
  cyberFraud: "1930",
  teleManas: "14416",
  elderline: "14567",
} as const;
