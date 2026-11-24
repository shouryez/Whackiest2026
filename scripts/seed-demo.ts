/**
 * Re-seeds the demo family on a running server (Lakshmi Amma + 14 days of labelled demo history).
 *   pnpm seed
 *   SERVER_URL=https://xyz.trycloudflare.com INTERNAL_TOKEN=... pnpm seed
 */
import { existsSync, readFileSync } from "node:fs";
const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const localEnv: Record<string, string> = existsSync(ENV_FILE)
  ? Object.fromEntries(readFileSync(ENV_FILE, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=([^#]*)/)).filter(Boolean).map((m) => [m![1], m![2].trim()]))
  : {};
const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const TOKEN = process.env.INTERNAL_TOKEN ?? (localEnv.INTERNAL_TOKEN || "dev-internal-token");

const res = await fetch(`${SERVER}/internal/demo/seed`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
console.log(res.ok ? "Seeded demo family (eld_lakshmi)." : `Seed failed: ${res.status} ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
