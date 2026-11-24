import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ElevenLabs webhook signature (plan.md Section 8.6). Header format:
 *   ElevenLabs-Signature: t=<unix seconds>,v0=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 * Rejects stale timestamps (default tolerance 30 min). Verify against the current docs.
 */
export function signElevenLabs(secret: string, rawBody: string, t = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v0=${mac}`;
}

export function verifyElevenLabs(
  secret: string,
  rawBody: string,
  header: string | undefined | null,
  toleranceSec = 30 * 60,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const v0 = parts.v0;
  if (!t || !v0) return { ok: false, reason: "malformed signature" };
  if (Math.abs(nowSec - t) > toleranceSec) return { ok: false, reason: "stale timestamp" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v0, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  return { ok: true };
}
