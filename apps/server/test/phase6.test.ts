import { beforeEach, describe, expect, it } from "vitest";
import { runTool } from "../src/control/tiers";
import { CLINIC_TOOL_SPECS } from "../src/mcp/clinicServer";
import { confirmAppointment, requestAppointment, suggestSlot } from "../src/packs/kaiseho/clinic";
import { buildContext } from "../src/packs/kaiseho/context";
import { decodeFrequency, parseImage, PrescriptionError, readPrescription } from "../src/packs/kaiseho/prescription";
import { DEMO, seedDemo } from "../src/packs/kaiseho/seed";
import { AGENT_TOOLS } from "../src/packs/kaiseho/tools";
import { getRepo } from "../src/repo";

const repo = getRepo();
const elder = async () => (await repo.getElder(DEMO.elderId))!;
const tick = () => new Promise((r) => setTimeout(r, 20));
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(async () => { await seedDemo({ resetEvents: true }); });

describe("prescription shorthand (deterministic, no AI needed)", () => {
  const cases: [string, string[], boolean?][] = [
    ["1-0-1", ["morning", "night"]],
    ["1-1-1 after food", ["morning", "afternoon", "night"]],
    ["0-0-1", ["night"]],
    ["½-0-½", ["morning", "night"]],
    ["1-0-0-1", ["morning", "night"]],
    ["BD", ["morning", "night"]],
    ["OD", ["morning"]],
    ["OD at night", ["night"]],
    ["TDS", ["morning", "afternoon", "night"]],
    ["HS", ["night"]],
    ["SOS", [], true],
  ];
  for (const [txt, slots, sos] of cases) {
    it(`decodes "${txt}"`, () => {
      const d = decodeFrequency(txt);
      expect(d.slots).toEqual(slots);
      if (sos) expect(d.asNeeded).toBe(true);
    });
  }
  it("reads food timing", () => {
    expect(decodeFrequency("1-0-1 AC").withFood).toBe("before");
    expect(decodeFrequency("BD after food").withFood).toBe("after");
  });
});

describe("prescription photo", () => {
  it("rejects non-images and oversized photos", () => {
    expect(() => parseImage("data:application/pdf;base64,AAAA")).toThrow(PrescriptionError);
    expect(() => parseImage(`data:image/png;base64,${"A".repeat(7_500_000)}`)).toThrow(/too large/);
    expect(parseImage("data:image/jpeg;base64,/9j/AAAA").mediaType).toBe("image/jpeg");
  });
  it("without an AI key: a clear message, nothing saved", async () => {
    const before = (await repo.listMedications(DEMO.elderId)).length;
    await expect(readPrescription(parseImage("data:image/jpeg;base64,/9j/AAAA"))).rejects.toMatchObject({ status: 503 });
    expect((await repo.listMedications(DEMO.elderId)).length).toBe(before);
  });
});

describe("clinic-calling agent", () => {
  it("suggests the next matching day and time of day", () => {
    expect(suggestSlot("Thursday morning", "Asia/Kolkata", "2026-11-30")).toBe("2026-12-03T10:30"); // Mon → Thu
    expect(suggestSlot("kal shaam", "Asia/Kolkata", "2026-11-30")).toBe("2026-12-01T17:30");
  });

  it("the elder's request needs her consent", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runTool(AGENT_TOOLS.request_appointment.spec as any, { elder_id: DEMO.elderId, call_id: "c6", preferred: "Thursday morning", elder_consented: false }, { actor: "agent" });
    expect(parse(r).reason).toMatch(/consent/);
  });

  it("books, tells the family, and the next call tells her", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = parse(await runTool(AGENT_TOOLS.request_appointment.spec as any, { elder_id: DEMO.elderId, call_id: "c6", preferred: "Thursday morning", reason: "knee", elder_consented: true }, { actor: "agent" }));
    expect(r.say).toMatch(/Rao Clinic/);
    await tick();
    const appt = (await repo.listAppointments(DEMO.elderId))[0];
    expect(appt.status).toBe("calling");
    expect(appt.mode).toBe("simulated");
    expect(appt.reason).toBe("follow-up visit"); // the clinic never hears "knee"

    // The clinic agent confirms through its own narrow door.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = parse(await runTool(CLINIC_TOOL_SPECS.confirm_appointment as any, { elder_id: DEMO.elderId, appointment_id: appt.appointmentId, slot_local_iso: "2026-12-03T10:30" }, { actor: "clinic-agent" }));
    expect(ok.booked_for).toMatch(/Thursday/);
    expect((await repo.getAppointment(DEMO.elderId, appt.appointmentId))!.status).toBe("confirmed");
    expect((await repo.listAlerts(DEMO.familyId)).some((a) => a.type === "appointment" && /booked/i.test(a.title))).toBe(true);
    const ctx = await buildContext(await elder(), "daily", "next");
    expect(ctx.family_messages).toMatch(/Dr\. Rao/);

    // Once booked, the clinic door can't touch it again.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const again = parse(await runTool(CLINIC_TOOL_SPECS.report_no_slot as any, { elder_id: DEMO.elderId, appointment_id: appt.appointmentId, reason: "x" }, { actor: "clinic-agent" }));
    expect(again.reason).toMatch(/not being booked/);
  });

  it("confirming twice is idempotent (no duplicate messages)", async () => {
    const appt = await requestAppointment(await elder(), { preferred: "Friday evening", requestedBy: "family:mem_ravi" });
    await tick();
    await confirmAppointment(await elder(), appt.appointmentId, "2026-12-04T17:30");
    await confirmAppointment(await elder(), appt.appointmentId, "2026-12-04T17:30");
    expect((await repo.listMessages(DEMO.elderId)).filter((m) => m.fromName === "KaiseHo")).toHaveLength(1);
  });
});
