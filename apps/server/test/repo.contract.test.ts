import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
// @ts-expect-error dynalite ships no types
import dynalite from "dynalite";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { kaisehoPostCall, purgeTranscripts } from "../src/packs/kaiseho/postcall";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { filterForFamily, todayView } from "../src/packs/kaiseho/views";
import { setRepo, type Repo } from "../src/repo";
import { DynamoRepo } from "../src/repo/dynamoRepo";
import { MemoryRepo } from "../src/repo/memoryRepo";

/**
 * Same contract for both storage engines: MemoryRepo (demo) and DynamoRepo (AWS),
 * the latter against dynalite (a local DynamoDB implementation) with the production table shape.
 */
let server: { listen: (p: number, cb: () => void) => void; close: (cb: () => void) => void; address: () => AddressInfo };
let endpoint = "";

beforeAll(async () => {
  server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
  await new Promise<void>((r) => server.listen(0, r));
  endpoint = `http://127.0.0.1:${server.address().port}`;
  const ddb = new DynamoDBClient({ region: "ap-south-1", endpoint, credentials: { accessKeyId: "x", secretAccessKey: "x" } });
  await ddb.send(new CreateTableCommand({
    TableName: "kaiseho_test",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: ["pk", "sk", "gsi1pk", "gsi1sk"].map((n) => ({ AttributeName: n, AttributeType: "S" })),
    KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
    GlobalSecondaryIndexes: [{ IndexName: "gsi1", KeySchema: [{ AttributeName: "gsi1pk", KeyType: "HASH" }, { AttributeName: "gsi1sk", KeyType: "RANGE" }], Projection: { ProjectionType: "ALL" } }],
  }));
});
afterAll(async () => {
  setRepo(new MemoryRepo());
  await new Promise<void>((r) => server.close(r));
});

const engines: [string, () => Repo][] = [
  ["MemoryRepo", () => new MemoryRepo()],
  ["DynamoRepo", () => new DynamoRepo({ table: "kaiseho_test", endpoint })],
];

describe.each(engines)("%s", (_name, make) => {
  let repo: Repo;
  beforeAll(async () => {
    repo = make();
    setRepo(repo);
    await seedDemo({ resetEvents: true });
  });

  it("seed round-trips: family, members, elder, meds, 14 days of history", async () => {
    expect((await repo.getFamily(DEMO.familyId))?.name).toMatch(/Lakshmi/);
    expect((await repo.listMembers(DEMO.familyId)).map((m) => m.name).sort()).toEqual(["Kamala aunty", "Priya", "Ravi"]);
    expect((await repo.listEldersByFamily(DEMO.familyId))[0].elderId).toBe(DEMO.elderId);
    expect(await repo.listMedications(DEMO.elderId)).toHaveLength(1);
    expect((await repo.listCheckIns(DEMO.elderId)).length).toBe(14);
    const logs = await repo.listMedLogs(DEMO.elderId);
    expect(logs.length).toBe(28);
    expect(logs[0].sk).toMatch(/^\d{4}-\d{2}-\d{2}#med_metformin#/); // entity sk survives storage
    expect((await repo.listCalls(DEMO.elderId)).length).toBe(14);
  });

  it("date-range medlog queries and family-call ranges work", async () => {
    const all = await repo.listMedLogs(DEMO.elderId);
    const since = all[all.length - 4].date;
    const recent = await repo.listMedLogs(DEMO.elderId, since);
    expect(recent.every((l) => l.date >= since)).toBe(true);
    expect(recent.length).toBeLessThan(all.length);
    expect((await repo.listFamilyCalls(DEMO.elderId)).length).toBe(4);
  });

  it("a full call: tools → alerts → post-call summary → conversation lookup", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (name: keyof typeof AGENT_TOOLS, args: object) => runTool(AGENT_TOOLS[name].spec as any, { elder_id: DEMO.elderId, call_id: "call_contract", ...args }, { actor: "agent" });
    await t("log_wellbeing", { mood: 4, sleep: "good" });
    await t("check_scam", { description: "CBI officer said arrest, stay on video call, don't tell anyone, OTP 482913" });
    await t("save_memory", { type: "preference", text: "Private thing about savings account", private: true });
    await kaisehoPostCall.onTranscript({
      type: "post_call_transcription",
      data: { conversation_id: "conv_contract", transcript: [{ role: "user", message: "my OTP is 123456" }], conversation_initiation_client_data: { dynamic_variables: { elder_id: DEMO.elderId, call_id: "call_contract" } } },
    });
    const call = await repo.getCallByConversation("conv_contract");
    expect(call?.callId).toBe("call_contract");
    expect(call?.summary?.family_en).toMatch(/scam/i);
    const alerts = await repo.listAlerts(DEMO.familyId);
    expect(alerts[0].createdAt >= alerts[alerts.length - 1].createdAt).toBe(true); // newest first
    expect(alerts.some((a) => a.type === "scam")).toBe(true);
    const audit = await repo.listAudit(DEMO.elderId);
    expect(audit[0].sk).toMatch(/#\d{6}$/);
    expect(JSON.stringify(audit)).not.toContain("482913");
    expect(JSON.stringify(await repo.listTurns("call_contract"))).not.toContain("123456");
  });

  it("appointments round-trip (clinic agent)", async () => {
    const now = new Date().toISOString();
    const base = { elderId: DEMO.elderId, familyId: DEMO.familyId, clinicId: "clinic_rao", clinicName: "Rao Clinic", doctor: "Dr. Rao", preferred: "Thursday morning", reason: "follow-up visit", requestedBy: "elder", createdAt: now, updatedAt: now };
    await repo.putAppointment({ ...base, appointmentId: "appt_a", status: "calling" });
    await repo.putAppointment({ ...base, appointmentId: "appt_b", status: "confirmed", slotLocalIso: "2026-12-03T10:30", createdAt: new Date(Date.now() + 1000).toISOString() });
    expect((await repo.getAppointment(DEMO.elderId, "appt_a"))?.status).toBe("calling");
    expect((await repo.listAppointments(DEMO.elderId)).map((a) => a.appointmentId)).toEqual(["appt_b", "appt_a"]);
    expect((await repo.getElder(DEMO.elderId))?.clinics?.[0].doctor).toBe("Dr. Rao");
  });

  it("occasions + the all-elders index (multi-elder schedulers) round-trip", async () => {
    expect((await repo.listOccasions(DEMO.familyId)).map((o) => o.occasionId).sort()).toEqual(["occ_aarav_bday", "occ_amma_bday"]);
    await repo.deleteOccasion(DEMO.familyId, "occ_amma_bday");
    expect((await repo.listOccasions(DEMO.familyId)).map((o) => o.occasionId)).toEqual(["occ_aarav_bday"]);
    const before = (await repo.listAllElders()).length;
    await repo.putElder({ ...(await repo.getElder(DEMO.elderId))!, elderId: "eld_second", name: "Second" });
    expect((await repo.listAllElders()).map((e) => e.elderId).sort()).toEqual([DEMO.elderId, "eld_second"]);
    expect(before).toBe(1);
  });

  it("privacy holds across engines: private memories never reach family views", async () => {
    const elder = (await repo.getElder(DEMO.elderId))!;
    const { memories, privateCount } = await filterForFamily(elder);
    expect(JSON.stringify(memories)).not.toMatch(/savings/i);
    expect(privateCount).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(await todayView(elder))).not.toMatch(/savings/i);
  });

  it("transcript purge + delete-all-data empty everything for the family", async () => {
    const turns = await repo.listTurns("call_contract");
    await repo.putTurns(turns.map((x) => ({ ...x, purgeAt: new Date(Date.now() - 1000).toISOString() })));
    expect(await purgeTranscripts()).toBeGreaterThan(0);
    expect(await repo.listTurns("call_contract")).toHaveLength(0);

    await repo.deleteFamilyData(DEMO.familyId);
    expect(await repo.getFamily(DEMO.familyId)).toBeUndefined();
    expect(await repo.getElder(DEMO.elderId)).toBeUndefined();
    expect(await repo.listMemories(DEMO.elderId)).toHaveLength(0);
    expect(await repo.listAlerts(DEMO.familyId)).toHaveLength(0);
    expect(await repo.listAudit(DEMO.elderId)).toHaveLength(0);
    expect(await repo.listAppointments(DEMO.elderId)).toHaveLength(0);
    expect(await repo.listOccasions(DEMO.familyId)).toHaveLength(0);
    expect((await repo.listAllElders()).filter((e) => e.familyId === DEMO.familyId)).toHaveLength(0);
  });
});
