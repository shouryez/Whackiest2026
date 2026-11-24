/**
 * Re-seeds the demo family on a running server (Lakshmi Amma + 14 days of labelled demo history).
 *   pnpm seed
 *   SERVER_URL=https://xyz.trycloudflare.com INTERNAL_TOKEN=... pnpm seed
 */
const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const TOKEN = process.env.INTERNAL_TOKEN ?? "dev-internal-token";

const res = await fetch(`${SERVER}/internal/demo/seed`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
console.log(res.ok ? "Seeded demo family (eld_lakshmi)." : `Seed failed: ${res.status} ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
