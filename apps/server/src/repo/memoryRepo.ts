import type {
  Alert, Audit, Call, CheckIn, Elder, Family, Medication, MedLog, Member, Memory, Message,
} from "@kaiseho/shared";
import type { Repo } from "./index";

/** In-process store with the same shapes as the DynamoDB tables. Data is lost on restart. */
export class MemoryRepo implements Repo {
  private families = new Map<string, Family>();
  private members = new Map<string, Member>(); // key familyId#memberId
  private elders = new Map<string, Elder>();
  private meds = new Map<string, Medication>(); // elderId#medId
  private medLogs = new Map<string, MedLog>(); // elderId#sk
  private checkIns = new Map<string, CheckIn>(); // elderId#callId
  private calls = new Map<string, Call>(); // elderId#callId
  private memories = new Map<string, Memory>(); // elderId#memoryId
  private alerts = new Map<string, Alert>();
  private messages = new Map<string, Message>(); // elderId#messageId
  private audit: Audit[] = [];

  async putFamily(f: Family) { this.families.set(f.familyId, f); }
  async getFamily(id: string) { return this.families.get(id); }
  async putMember(m: Member) { this.members.set(`${m.familyId}#${m.memberId}`, m); }
  async listMembers(familyId: string) { return [...this.members.values()].filter((m) => m.familyId === familyId); }

  async putElder(e: Elder) { this.elders.set(e.elderId, e); }
  async getElder(id: string) { return this.elders.get(id); }
  async listEldersByFamily(familyId: string) { return [...this.elders.values()].filter((e) => e.familyId === familyId); }

  async putMedication(m: Medication) { this.meds.set(`${m.elderId}#${m.medId}`, m); }
  async listMedications(elderId: string) { return [...this.meds.values()].filter((m) => m.elderId === elderId); }
  async putMedLog(l: MedLog) { this.medLogs.set(`${l.elderId}#${l.sk}`, l); }
  async listMedLogs(elderId: string, sinceDate?: string) {
    return [...this.medLogs.values()].filter((l) => l.elderId === elderId && (!sinceDate || l.date >= sinceDate));
  }

  async getCheckIn(elderId: string, callId: string) { return this.checkIns.get(`${elderId}#${callId}`); }
  async putCheckIn(c: CheckIn) { this.checkIns.set(`${c.elderId}#${c.callId}`, c); }
  async listCheckIns(elderId: string, sinceDate?: string) {
    return [...this.checkIns.values()]
      .filter((c) => c.elderId === elderId && (!sinceDate || c.date >= sinceDate))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async putCall(c: Call) { this.calls.set(`${c.elderId}#${c.callId}`, c); }
  async getCall(elderId: string, callId: string) { return this.calls.get(`${elderId}#${callId}`); }
  async listCalls(elderId: string) { return [...this.calls.values()].filter((c) => c.elderId === elderId); }

  async putMemory(m: Memory) { this.memories.set(`${m.elderId}#${m.memoryId}`, m); }
  async listMemories(elderId: string) { return [...this.memories.values()].filter((m) => m.elderId === elderId); }

  async putAlert(a: Alert) { this.alerts.set(a.alertId, a); }
  async getAlert(id: string) { return this.alerts.get(id); }
  async listAlerts(familyId: string) {
    return [...this.alerts.values()].filter((a) => a.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putMessage(m: Message) { this.messages.set(`${m.elderId}#${m.messageId}`, m); }
  async listMessages(elderId: string) {
    return [...this.messages.values()].filter((m) => m.elderId === elderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async putAudit(a: Audit) { this.audit.push(a); if (this.audit.length > 5000) this.audit.shift(); }
  async listAudit(elderId: string) { return this.audit.filter((a) => a.elderId === elderId).slice().reverse(); }

  async deleteFamilyData(familyId: string) {
    const elderIds = new Set((await this.listEldersByFamily(familyId)).map((e) => e.elderId));
    const dropByElder = <T extends { elderId: string }>(m: Map<string, T>) => {
      for (const [k, v] of m) if (elderIds.has(v.elderId)) m.delete(k);
    };
    dropByElder(this.meds); dropByElder(this.medLogs); dropByElder(this.checkIns); dropByElder(this.calls);
    dropByElder(this.memories); dropByElder(this.messages); dropByElder(this.elders);
    this.audit = this.audit.filter((a) => !elderIds.has(a.elderId));
    for (const [k, a] of this.alerts) if (a.familyId === familyId) this.alerts.delete(k);
    for (const [k, m] of this.members) if (m.familyId === familyId) this.members.delete(k);
    this.families.delete(familyId);
  }

  async clearAll() {
    for (const m of [this.families, this.members, this.elders, this.meds, this.medLogs, this.checkIns, this.calls, this.memories, this.alerts, this.messages]) m.clear();
    this.audit = [];
  }
}
