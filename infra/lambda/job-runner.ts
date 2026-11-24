import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/**
 * Job runner: target of every EventBridge Scheduler schedule (daily calls, reminders, callbacks,
 * retries, emergency repeats, weekly digests). It forwards the job to the Ek Call server,
 * which owns all logic (/internal/jobs/run, internal token). Keeps the Lambda tiny and stateless.
 */
const sm = new SecretsManagerClient({});
let token: string | undefined;

async function internalToken(): Promise<string> {
  if (token) return token;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN! }));
  token = (JSON.parse(r.SecretString ?? "{}") as { INTERNAL_TOKEN?: string }).INTERNAL_TOKEN;
  if (!token) throw new Error("INTERNAL_TOKEN missing in the kaiseho/server secret");
  return token;
}

export async function handler(event: { job?: unknown } & Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
  const job = event.job ?? event;
  const res = await fetch(`${process.env.SERVER_URL}/internal/jobs/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await internalToken()}` },
    body: JSON.stringify({ job }),
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  console.log(JSON.stringify({ job, status: res.status, body: text.slice(0, 300) }));
  // Throwing makes EventBridge Scheduler retry (with its retry policy) on server errors.
  if (res.status >= 500) throw new Error(`server ${res.status}`);
  return { ok: res.ok, status: res.status };
}
