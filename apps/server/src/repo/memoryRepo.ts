import type {
  Alert, Audit, Call, CheckIn, Appointment, Consent, Digest, Elder, Family, FamilyCall, Medication, MedLog, Member, Memory, Message, Nudge, Occasion, Reminder, Turn,
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
  private turns = new Map<string, Turn[]>(); // callId -> turns
  private consents: Consent[] = [];
  private reminders = new Map<string, Reminder>();
  private familyCalls: FamilyCall[] = [];
  private nudges = new Map<string, Nudge>();
  private digests: Digest[] = [];
  private appointments = new Map<string, Appointment>();
  private occasions = new Map<string, Occasion>(); // familyId#occasionId

  async putFamily(f: Family) { this.families.set(f.familyId, f); }
  async getFamily(id: string) { return this.families.get(id); }
  async putMember(m: Member) { this.members.set(`${m.familyId}#${m.memberId}`, m); }
  async listMembers(familyId: string) { return [...this.members.values()].filter((m) => m.familyId === familyId); }

  async putElder(e: Elder) { this.elders.set(e.elderId, e); }
  async getElder(id: string) { return this.elders.get(id); }
  async listEldersByFamily(familyId: string) { return [...this.elders.values()].filter((e) => e.familyId === familyId); }
  async listAllElders() { return [...this.elders.values()]; }

  async putMedication(m: Medication) { this.meds.set(`${m.elderId}#${m.medId}`, m); }
  async deleteMedication(elderId: string, medId: string) { this.meds.delete(`${elderId}#${medId}`); }
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
  async listCalls(elderId: string) {
    return [...this.calls.values()].filter((c) => c.elderId === elderId).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }
  async getCallByConversation(conversationId: string) { return [...this.calls.values()].find((c) => c.conversationId === conversationId); }

  async putTurns(turns: Turn[]) { if (turns[0]) this.turns.set(turns[0].callId, turns); }
  async listTurns(callId: string) { return this.turns.get(callId) ?? []; }
  async purgeTurns(now: string) {
    let n = 0;
    for (const [k, ts] of this.turns) if (ts[0] && ts[0].purgeAt <= now) { this.turns.delete(k); n += ts.length; }
    return n;
  }

  async putConsent(c: Consent) { this.consents.push(c); }
  async getLatestConsent(elderId: string) { return this.consents.filter((c) => c.elderId === elderId).at(-1); }
  async putReminder(r: Reminder) { this.reminders.set(r.reminderId, r); }
  async listReminders(elderId: string) { return [...this.reminders.values()].filter((r) => r.elderId === elderId); }
  async putFamilyCall(f: FamilyCall) { this.familyCalls.push(f); }
  async listFamilyCalls(elderId: string, since?: string) { return this.familyCalls.filter((f) => f.elderId === elderId && (!since || f.at >= since)); }
  async putNudge(n: Nudge) { this.nudges.set(n.nudgeId, n); }
  async putDigest(d: Digest) { this.digests = this.digests.filter((x) => x.digestId !== d.digestId); this.digests.push(d); }
  async putOccasion(o: Occasion) { this.occasions.set(`${o.familyId}#${o.occasionId}`, o); }
  async listOccasions(familyId: string) { return [...this.occasions.values()].filter((o) => o.familyId === familyId); }
  async deleteOccasion(familyId: string, occasionId: string) { this.occasions.delete(`${familyId}#${occasionId}`); }
  async putAppointment(a: Appointment) { this.appointments.set(a.appointmentId, a); }
  async getAppointment(elderId: string, id: string) { const a = this.appointments.get(id); return a?.elderId === elderId ? a : undefined; }
  async listAppointments(elderId: string) { return [...this.appointments.values()].filter((a) => a.elderId === elderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listDigests(elderId: string) { return this.digests.filter((d) => d.elderId === elderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listNudges(elderId: string) {
    return [...this.nudges.values()].filter((n) => n.elderId === elderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putMemory(m: Memory) { this.memories.set(`${m.elderId}#${m.memoryId}`, m); }
  async getMemory(elderId: string, memoryId: string) { return this.memories.get(`${elderId}#${memoryId}`); }
  async listMemories(elderId: string) { return [...this.memories.values()].filter((m) => m.elderId === elderId); }

  async putAlert(a: Alert) { this.alerts.set(a.alertId, a); }
  async getAlert(id: string) { return this.alerts.get(id); }
  async listAlerts(familyId: string) {
    return [...this.alerts.values()].filter((a) => a.familyId === familyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putMessage(m: Message) { this.messages.set(`${m.elderId}#${m.messageId}`, m); }
  async getMessage(elderId: string, messageId: string) { return this.messages.get(`${elderId}#${messageId}`); }
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
    for (const [k, ts] of this.turns) if (ts[0] && elderIds.has(ts[0].elderId)) this.turns.delete(k);
    this.consents = this.consents.filter((c) => !elderIds.has(c.elderId));
    for (const [k, r] of this.reminders) if (elderIds.has(r.elderId)) this.reminders.delete(k);
    this.familyCalls = this.familyCalls.filter((f) => f.familyId !== familyId);
    for (const [k, n] of this.nudges) if (elderIds.has(n.elderId)) this.nudges.delete(k);
    this.digests = this.digests.filter((d) => d.familyId !== familyId);
    for (const [k, a] of this.appointments) if (a.familyId === familyId) this.appointments.delete(k);
    for (const [k, o] of this.occasions) if (o.familyId === familyId) this.occasions.delete(k);
    for (const [k, a] of this.alerts) if (a.familyId === familyId) this.alerts.delete(k);
    for (const [k, m] of this.members) if (m.familyId === familyId) this.members.delete(k);
    this.families.delete(familyId);
  }

  async clearAll() {
    for (const m of [this.families, this.members, this.elders, this.meds, this.medLogs, this.checkIns, this.calls, this.memories, this.alerts, this.messages]) m.clear();
    this.audit = [];
    this.turns.clear(); this.consents = []; this.reminders.clear(); this.familyCalls = []; this.nudges.clear(); this.digests = []; this.appointments.clear(); this.occasions.clear();
  }
}
