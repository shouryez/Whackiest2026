import type { Audit, Tier } from "@kaiseho/shared";
import { getRepo } from "../repo";
import { redactDeep } from "./redact";

let seq = 0;

export async function writeAudit(a: {
  elderId: string;
  actor: string;
  tool: string;
  tier: Tier;
  args: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
  callId?: string;
}): Promise<Audit> {
  const ts = new Date().toISOString();
  const entry: Audit = {
    elderId: a.elderId,
    sk: `${ts}#${String(++seq).padStart(6, "0")}`,
    ts,
    actor: a.actor,
    tool: a.tool,
    tier: a.tier,
    argsRedacted: redactDeep(a.args),
    resultSummary: redactDeep(a.resultSummary).slice(0, 300),
    ok: a.ok,
    callId: a.callId,
  };
  await getRepo().putAudit(entry);
  return entry;
}
