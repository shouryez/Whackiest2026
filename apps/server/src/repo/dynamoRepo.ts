import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type {
  Alert, Audit, Call, CheckIn, Appointment, Consent, Digest, Elder, Family, FamilyCall, Medication, MedLog, Member, Memory, Message, Need, Nudge, Occasion, Reminder, Turn, Vital,
} from "@kaiseho/shared";
import { env } from "../env";
import type { Repo } from "./index";

/**
 * DynamoDB implementation of Repo (Phase 4). Single-table design, region ap-south-1 (data in India).
 *
 *   pk                 sk                          gsi1pk               gsi1sk
 *   FAMILY#f           META | MEMBER#m | OCC#id
 *   ELDERS             ELDER#e  (index of every elder, for schedulers)
 *   ELDER#e            META                        FAMILY#f             ELDER#e
 *   ELDER#e            MED#id | MEDLOG#date#med#slot | CHECKIN#call | CALL#call | MEM#id | MSG#id
 *                      VITAL#date#id | NEED#id
 *                      AUDIT#ts#seq | CONSENT#ts | REM#id | FCALL#at#id | NUDGE#id | DIGEST#id
 *   CALL#call          TURNS  (ttl = purgeAt, DynamoDB TTL also deletes it)
 *   ALERT#id           META                        FAMILY#f             ALERT#createdAt#id
 *   (Call items also:                              CONV#conversationId  CALL)
 */
type Item = Record<string, unknown>;
const strip = <T>(it: Item | undefined, skPrefix?: string): T | undefined => {
  if (!it) return undefined;
  const { pk, sk, gsi1pk, gsi1sk, ttl, _t, ...rest } = it;
  void pk; void gsi1pk; void gsi1sk; void ttl; void _t;
  // Entities that carry their own "sk" (MedLog, Audit) get it back from the table sort key.
  if (skPrefix) (rest as Item).sk = String(sk).slice(skPrefix.length);
  return rest as T;
};

export class DynamoRepo implements Repo {
  private doc: DynamoDBDocumentClient;
  private table: string;

  constructor(opts: { table?: string; endpoint?: string; region?: string } = {}) {
    const client = new DynamoDBClient({
      region: opts.region ?? env.AWS_REGION,
      ...(opts.endpoint ?? env.DDB_ENDPOINT ? { endpoint: opts.endpoint ?? env.DDB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
    });
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
    this.table = opts.table ?? env.DDB_TABLE;
  }

  // ---------- low-level helpers ----------
  /** Entity fields first, table keys last, so keys always win. */
  private async put(keys: Item, entity: object) { await this.doc.send(new PutCommand({ TableName: this.table, Item: { ...entity, ...keys } })); }
  private async get<T>(pk: string, sk: string): Promise<T | undefined> {
    const r = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk } }));
    return strip<T>(r.Item);
  }
  private async query(input: Omit<QueryCommandInput, "TableName">): Promise<Item[]> {
    const out: Item[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(new QueryCommand({ TableName: this.table, ...input, ExclusiveStartKey: start }));
      out.push(...((r.Items ?? []) as Item[]));
      start = r.LastEvaluatedKey;
    } while (start);
    return out;
  }
  private async byPrefix<T>(pk: string, prefix: string, opts: { reverse?: boolean; from?: string; restoreSk?: boolean } = {}): Promise<T[]> {
    const items = await this.query({
      KeyConditionExpression: opts.from ? "pk = :pk AND sk BETWEEN :from AND :to" : "pk = :pk AND begins_with(sk, :p)",
      ExpressionAttributeValues: opts.from ? { ":pk": pk, ":from": `${prefix}${opts.from}`, ":to": `${prefix}￿` } : { ":pk": pk, ":p": prefix },
      ScanIndexForward: !opts.reverse,
    });
    return items.map((i) => strip<T>(i, opts.restoreSk ? prefix : undefined)!);
  }
  private async byGsi<T>(gsi1pk: string, prefix: string, reverse = false): Promise<T[]> {
    const items = await this.query({
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :g AND begins_with(gsi1sk, :p)",
      ExpressionAttributeValues: { ":g": gsi1pk, ":p": prefix },
      ScanIndexForward: !reverse,
    });
    return items.map((i) => strip<T>(i)!);
  }
  private async deleteKeys(keys: { pk: string; sk: string }[]) {
    for (let i = 0; i < keys.length; i += 25) {
      let req: Record<string, unknown[]> | undefined = { [this.table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) };
      while (req && Object.keys(req).length) {
        const r = await this.doc.send(new BatchWriteCommand({ RequestItems: req as never }));
        req = r.UnprocessedItems as Record<string, unknown[]> | undefined;
      }
    }
  }
  private async keysUnder(pk: string) {
    return (await this.query({ KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": pk }, ProjectionExpression: "pk, sk" })) as { pk: string; sk: string }[];
  }

  // ---------- families + members ----------
  async putFamily(f: Family) { await this.put({ pk: `FAMILY#${f.familyId}`, sk: "META", _t: "family" }, f); }
  async getFamily(id: string) { return this.get<Family>(`FAMILY#${id}`, "META"); }
  async putMember(m: Member) { await this.put({ pk: `FAMILY#${m.familyId}`, sk: `MEMBER#${m.memberId}`, _t: "member" }, m); }
  async listMembers(familyId: string) { return this.byPrefix<Member>(`FAMILY#${familyId}`, "MEMBER#"); }

  // ---------- elders ----------
  async putElder(e: Elder) {
    await this.put({ pk: `ELDER#${e.elderId}`, sk: "META", gsi1pk: `FAMILY#${e.familyId}`, gsi1sk: `ELDER#${e.elderId}`, _t: "elder" }, e);
    await this.put({ pk: "ELDERS", sk: `ELDER#${e.elderId}`, _t: "elder_index" }, { elderId: e.elderId, familyId: e.familyId });
  }
  async listAllElders() {
    const ids = await this.byPrefix<{ elderId: string }>("ELDERS", "ELDER#");
    return (await Promise.all(ids.map((x) => this.getElder(x.elderId)))).filter((e): e is Elder => Boolean(e));
  }
  async putVital(v: Vital) { await this.put({ pk: `ELDER#${v.elderId}`, sk: `VITAL#${v.date}#${v.vitalId}`, _t: "vital" }, v); }
  async listVitals(elderId: string, sinceDate?: string) {
    const out = await this.byPrefix<Vital>(`ELDER#${elderId}`, "VITAL#", sinceDate ? { from: sinceDate } : {});
    return out.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  }
  async putNeed(n: Need) { await this.put({ pk: `ELDER#${n.elderId}`, sk: `NEED#${n.needId}`, _t: "need" }, n); }
  async getNeed(elderId: string, needId: string) { return this.get<Need>(`ELDER#${elderId}`, `NEED#${needId}`); }
  async listNeeds(elderId: string) { return (await this.byPrefix<Need>(`ELDER#${elderId}`, "NEED#")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async putOccasion(o: Occasion) { await this.put({ pk: `FAMILY#${o.familyId}`, sk: `OCC#${o.occasionId}`, _t: "occasion" }, o); }
  async listOccasions(familyId: string) { return this.byPrefix<Occasion>(`FAMILY#${familyId}`, "OCC#"); }
  async deleteOccasion(familyId: string, occasionId: string) { await this.deleteKeys([{ pk: `FAMILY#${familyId}`, sk: `OCC#${occasionId}` }]); }
  async getElder(id: string) { return this.get<Elder>(`ELDER#${id}`, "META"); }
  async listEldersByFamily(familyId: string) { return this.byGsi<Elder>(`FAMILY#${familyId}`, "ELDER#"); }

  // ---------- medicines ----------
  async putMedication(m: Medication) { await this.put({ pk: `ELDER#${m.elderId}`, sk: `MED#${m.medId}`, _t: "med" }, m); }
  async deleteMedication(elderId: string, medId: string) { await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: `ELDER#${elderId}`, sk: `MED#${medId}` } })); }
  async listMedications(elderId: string) { return this.byPrefix<Medication>(`ELDER#${elderId}`, "MED#"); }
  async putMedLog(l: MedLog) { await this.put({ pk: `ELDER#${l.elderId}`, sk: `MEDLOG#${l.sk}`, _t: "medlog" }, l); }
  async listMedLogs(elderId: string, sinceDate?: string) { return this.byPrefix<MedLog>(`ELDER#${elderId}`, "MEDLOG#", { from: sinceDate, restoreSk: true }); }

  // ---------- wellbeing ----------
  async getCheckIn(elderId: string, callId: string) { return this.get<CheckIn>(`ELDER#${elderId}`, `CHECKIN#${callId}`); }
  async putCheckIn(c: CheckIn) { await this.put({ pk: `ELDER#${c.elderId}`, sk: `CHECKIN#${c.callId}`, _t: "checkin" }, c); }
  async listCheckIns(elderId: string, sinceDate?: string) {
    return (await this.byPrefix<CheckIn>(`ELDER#${elderId}`, "CHECKIN#"))
      .filter((c) => !sinceDate || c.date >= sinceDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  }

  // ---------- calls ----------
  async putCall(c: Call) {
    await this.put({ pk: `ELDER#${c.elderId}`, sk: `CALL#${c.callId}`, _t: "call", ...(c.conversationId ? { gsi1pk: `CONV#${c.conversationId}`, gsi1sk: "CALL" } : {}) }, c);
  }
  async getCall(elderId: string, callId: string) { return this.get<Call>(`ELDER#${elderId}`, `CALL#${callId}`); }
  async listCalls(elderId: string) {
    return (await this.byPrefix<Call>(`ELDER#${elderId}`, "CALL#")).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }
  async getCallByConversation(conversationId: string) { return (await this.byGsi<Call>(`CONV#${conversationId}`, "CALL"))[0]; }

  // ---------- transcripts ----------
  async putTurns(turns: Turn[]) {
    if (!turns[0]) return;
    const purgeAt = turns[0].purgeAt;
    await this.put({ pk: `CALL#${turns[0].callId}`, sk: "TURNS", _t: "turns", purgeAt, ttl: Math.floor(new Date(purgeAt).getTime() / 1000), elderId: turns[0].elderId }, { turns });
  }
  async listTurns(callId: string) {
    const it = await this.get<{ turns: Turn[] }>(`CALL#${callId}`, "TURNS");
    return it?.turns ?? [];
  }
  async purgeTurns(now: string) {
    let n = 0;
    let start: Record<string, unknown> | undefined;
    const keys: { pk: string; sk: string }[] = [];
    do {
      const r = await this.doc.send(new ScanCommand({
        TableName: this.table, ExclusiveStartKey: start,
        FilterExpression: "sk = :t AND purgeAt <= :now", ExpressionAttributeValues: { ":t": "TURNS", ":now": now },
        ProjectionExpression: "pk, sk, turns",
      }));
      for (const it of (r.Items ?? []) as { pk: string; sk: string; turns?: unknown[] }[]) { keys.push({ pk: it.pk, sk: it.sk }); n += it.turns?.length ?? 0; }
      start = r.LastEvaluatedKey;
    } while (start);
    await this.deleteKeys(keys);
    return n;
  }

  // ---------- consent, reminders, family calls, nudges, digests ----------
  async putConsent(c: Consent) { await this.put({ pk: `ELDER#${c.elderId}`, sk: `CONSENT#${c.recordedAt}`, _t: "consent" }, c); }
  async getLatestConsent(elderId: string) { return (await this.byPrefix<Consent>(`ELDER#${elderId}`, "CONSENT#", { reverse: true }))[0]; }
  async putReminder(r: Reminder) { await this.put({ pk: `ELDER#${r.elderId}`, sk: `REM#${r.reminderId}`, _t: "reminder" }, r); }
  async listReminders(elderId: string) { return this.byPrefix<Reminder>(`ELDER#${elderId}`, "REM#"); }
  async putFamilyCall(f: FamilyCall) { await this.put({ pk: `ELDER#${f.elderId}`, sk: `FCALL#${f.at}#${f.id}`, _t: "familycall" }, f); }
  async listFamilyCalls(elderId: string, since?: string) {
    return (await this.byPrefix<FamilyCall>(`ELDER#${elderId}`, "FCALL#")).filter((f) => !since || f.at >= since);
  }
  async putNudge(n: Nudge) { await this.put({ pk: `ELDER#${n.elderId}`, sk: `NUDGE#${n.nudgeId}`, _t: "nudge" }, n); }
  async listNudges(elderId: string) {
    return (await this.byPrefix<Nudge>(`ELDER#${elderId}`, "NUDGE#")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async putDigest(d: Digest) { await this.put({ pk: `ELDER#${d.elderId}`, sk: `DIGEST#${d.digestId}`, _t: "digest" }, d); }
  async putAppointment(a: Appointment) { await this.put({ pk: `ELDER#${a.elderId}`, sk: `APPT#${a.appointmentId}`, _t: "appointment" }, a); }
  async getAppointment(elderId: string, id: string) { return this.get<Appointment>(`ELDER#${elderId}`, `APPT#${id}`); }
  async listAppointments(elderId: string) {
    return (await this.byPrefix<Appointment>(`ELDER#${elderId}`, "APPT#")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listDigests(elderId: string) {
    return (await this.byPrefix<Digest>(`ELDER#${elderId}`, "DIGEST#")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---------- memories ----------
  async putMemory(m: Memory) { await this.put({ pk: `ELDER#${m.elderId}`, sk: `MEM#${m.memoryId}`, _t: "memory" }, m); }
  async getMemory(elderId: string, memoryId: string) { return this.get<Memory>(`ELDER#${elderId}`, `MEM#${memoryId}`); }
  async listMemories(elderId: string) { return this.byPrefix<Memory>(`ELDER#${elderId}`, "MEM#"); }

  // ---------- alerts ----------
  async putAlert(a: Alert) {
    await this.put({ pk: `ALERT#${a.alertId}`, sk: "META", gsi1pk: `FAMILY#${a.familyId}`, gsi1sk: `ALERT#${a.createdAt}#${a.alertId}`, _t: "alert" }, a);
  }
  async getAlert(id: string) { return this.get<Alert>(`ALERT#${id}`, "META"); }
  async listAlerts(familyId: string) { return this.byGsi<Alert>(`FAMILY#${familyId}`, "ALERT#", true); }

  // ---------- messages ----------
  async putMessage(m: Message) { await this.put({ pk: `ELDER#${m.elderId}`, sk: `MSG#${m.messageId}`, _t: "message" }, m); }
  async getMessage(elderId: string, messageId: string) { return this.get<Message>(`ELDER#${elderId}`, `MSG#${messageId}`); }
  async listMessages(elderId: string) {
    return (await this.byPrefix<Message>(`ELDER#${elderId}`, "MSG#")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---------- audit ----------
  async putAudit(a: Audit) { await this.put({ pk: `ELDER#${a.elderId}`, sk: `AUDIT#${a.sk}`, _t: "audit" }, a); }
  async listAudit(elderId: string) { return this.byPrefix<Audit>(`ELDER#${elderId}`, "AUDIT#", { reverse: true, restoreSk: true }); }

  // ---------- privacy: delete everything for a family ----------
  async deleteFamilyData(familyId: string) {
    const elders = await this.listEldersByFamily(familyId);
    const keys: { pk: string; sk: string }[] = [];
    for (const e of elders) {
      for (const c of await this.listCalls(e.elderId)) keys.push({ pk: `CALL#${c.callId}`, sk: "TURNS" });
      keys.push(...(await this.keysUnder(`ELDER#${e.elderId}`)));
      keys.push({ pk: "ELDERS", sk: `ELDER#${e.elderId}` });
    }
    for (const a of await this.listAlerts(familyId)) keys.push({ pk: `ALERT#${a.alertId}`, sk: "META" });
    keys.push(...(await this.keysUnder(`FAMILY#${familyId}`)));
    await this.deleteKeys(keys);
  }

  /** Demo only: wipes the table. */
  async clearAll() {
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(new ScanCommand({ TableName: this.table, ProjectionExpression: "pk, sk", ExclusiveStartKey: start }));
      await this.deleteKeys((r.Items ?? []) as { pk: string; sk: string }[]);
      start = r.LastEvaluatedKey;
    } while (start);
  }
}
