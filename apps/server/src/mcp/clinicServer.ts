import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { runTool, ToolRejected, type ToolSpec } from "../control/tiers";
import { confirmAppointment, reportNoSlot } from "../packs/kaiseho/clinic";
import { getRepo } from "../repo";

/**
 * /mcp/clinic: the clinic-calling agent's own door. It can only touch the ONE appointment it
 * is calling about (status "calling"), and only confirm it or report that there's no slot.
 */
async function callingAppointment(elderId: string, appointmentId: string) {
  const a = await getRepo().getAppointment(elderId, appointmentId);
  if (!a || a.status !== "calling") throw new ToolRejected("this appointment is not being booked right now");
  return a;
}

const base = { elder_id: z.string().describe("elder_id from your instructions"), appointment_id: z.string().describe("appointment_id from your instructions") };

const confirmShape = { ...base, slot_local_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/).describe("The agreed slot, local time, e.g. 2026-12-03T10:30"), notes: z.string().max(200).optional().describe("e.g. 'bring old reports', token number") };
const confirm: ToolSpec<z.infer<z.ZodObject<typeof confirmShape>>> = {
  name: "confirm_appointment", tier: "T2",
  label: (a) => `🏥 Clinic confirmed ${a.slot_local_iso.replace("T", " ")}`,
  run: async (a, { elder }) => {
    await callingAppointment(elder.elderId, a.appointment_id);
    const appt = await confirmAppointment(elder, a.appointment_id, a.slot_local_iso, a.notes);
    return { ok: true, booked_for: appt.slotSpoken };
  },
};

const noSlotShape = { ...base, reason: z.string().min(2).max(200).describe("What the clinic said, e.g. 'fully booked on Thursday, call back Monday'") };
const noSlot: ToolSpec<z.infer<z.ZodObject<typeof noSlotShape>>> = {
  name: "report_no_slot", tier: "T2",
  label: (a) => `🏥 Clinic had no slot: ${a.reason.slice(0, 60)}`,
  run: async (a, { elder }) => {
    await callingAppointment(elder.elderId, a.appointment_id);
    await reportNoSlot(elder, a.appointment_id, a.reason);
    return { ok: true };
  },
};

function build(): McpServer {
  const server = new McpServer({ name: "kaiseho-clinic", version: "0.1.0" }, { instructions: "Tools for booking one clinic appointment on behalf of a patient. Use exactly one of them, once, before ending the call." });
  server.registerTool("confirm_appointment", { description: "The clinic agreed a slot: record it.", inputSchema: confirmShape },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => runTool(confirm as any, args, { actor: "clinic-agent" }));
  server.registerTool("report_no_slot", { description: "The clinic could not give a slot (or asked to call back): record why.", inputSchema: noSlotShape },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => runTool(noSlot as any, args, { actor: "clinic-agent" }));
  return server;
}

export async function handleClinicMcp(req: Request): Promise<Response> {
  const server = build();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

export const CLINIC_TOOL_SPECS = { confirm_appointment: confirm, report_no_slot: noSlot };
