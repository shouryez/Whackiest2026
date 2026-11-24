import type {
  Alert, Audit, Call, CheckIn, Elder, Family, Medication, MedLog, Member, Memory, Message,
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

  // memories
  putMemory(m: Memory): Promise<void>;
  listMemories(elderId: string): Promise<Memory[]>;

  // alerts
  putAlert(a: Alert): Promise<void>;
  getAlert(alertId: string): Promise<Alert | undefined>;
  listAlerts(familyId: string): Promise<Alert[]>;

  // messages
  putMessage(m: Message): Promise<void>;
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
