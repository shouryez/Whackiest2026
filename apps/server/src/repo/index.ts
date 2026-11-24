import type {
  Alert, Audit, Call, CheckIn, Consent, Elder, Family, FamilyCall, Medication, MedLog, Member, Memory, Message, Nudge, Reminder, Turn,
} from "@kaiseho/shared";
import { env } from "../env";
import { MemoryRepo } from "./memoryRepo";

/**
 * Every storage call goes through this interface (plan.md Section 0).
 * MemoryRepo = local dev + demo; DynamoRepo = AWS (Phase 4). Switch with DATA_STORE.
 */
export interface Repo {
  // families + members
  putFamily(f: Family): Promise<void>;
  getFamily(familyId: string): Promise<Family | undefined>;
  putMember(m: Member): Promise<void>;
  listMembers(familyId: string): Promise<Member[]>;

  // elders
  putElder(e: Elder): Promise<void>;
  getElder(elderId: string): Promise<Elder | undefined>;
  listEldersByFamily(familyId: string): Promise<Elder[]>;

  // medicines
  putMedication(m: Medication): Promise<void>;
  deleteMedication(elderId: string, medId: string): Promise<void>;
  listMedications(elderId: string): Promise<Medication[]>;
  putMedLog(l: MedLog): Promise<void>;
  listMedLogs(elderId: string, sinceDate?: string): Promise<MedLog[]>;

  // wellbeing
  getCheckIn(elderId: string, callId: string): Promise<CheckIn | undefined>;
  putCheckIn(c: CheckIn): Promise<void>;
  listCheckIns(elderId: string, sinceDate?: string): Promise<CheckIn[]>;

  // calls
  putCall(c: Call): Promise<void>;
  getCall(elderId: string, callId: string): Promise<Call | undefined>;
  listCalls(elderId: string): Promise<Call[]>;
  getCallByConversation(conversationId: string): Promise<Call | undefined>;

  // transcripts (redacted, purged after TRANSCRIPT_RETENTION_HOURS)
  putTurns(turns: Turn[]): Promise<void>;
  listTurns(callId: string): Promise<Turn[]>;
  purgeTurns(nowIso: string): Promise<number>;

  // consent, reminders, family calls, nudges
  putConsent(c: Consent): Promise<void>;
  getLatestConsent(elderId: string): Promise<Consent | undefined>;
  putReminder(r: Reminder): Promise<void>;
  listReminders(elderId: string): Promise<Reminder[]>;
  putFamilyCall(f: FamilyCall): Promise<void>;
  listFamilyCalls(elderId: string, sinceIso?: string): Promise<FamilyCall[]>;
  putNudge(n: Nudge): Promise<void>;
  listNudges(elderId: string): Promise<Nudge[]>;

  // memories
  putMemory(m: Memory): Promise<void>;
  getMemory(elderId: string, memoryId: string): Promise<Memory | undefined>;
  listMemories(elderId: string): Promise<Memory[]>;

  // alerts
  putAlert(a: Alert): Promise<void>;
  getAlert(alertId: string): Promise<Alert | undefined>;
  listAlerts(familyId: string): Promise<Alert[]>;

  // messages
  putMessage(m: Message): Promise<void>;
  getMessage(elderId: string, messageId: string): Promise<Message | undefined>;
  listMessages(elderId: string): Promise<Message[]>;

  // audit
  putAudit(a: Audit): Promise<void>;
  listAudit(elderId: string): Promise<Audit[]>;

  /** Wipes every table for a family (privacy: "Delete all data"). */
  deleteFamilyData(familyId: string): Promise<void>;
  /** Demo only. */
  clearAll(): Promise<void>;
}

let repo: Repo | undefined;
export function getRepo(): Repo {
  if (!repo) {
    if (env.DATA_STORE === "dynamo") {
      throw new Error("DynamoRepo arrives in Phase 4; use DATA_STORE=memory for now");
    }
    repo = new MemoryRepo();
  }
  return repo;
}
