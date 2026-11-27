import { randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { Elder } from "@kaiseho/shared";
import { env } from "../../env";
import { getRepo } from "../../repo";
import { escapeHtml } from "../../engine/notify/telegram";
import { vitalsSummary } from "./vitals";

/**
 * Emergency health card: a QR on the fridge or in her purse. A neighbour or paramedic scans it and sees
 * conditions, medicines, allergies, blood group and who to call. Opt-in, read-only, its own random
 * token (rotatable), no login. Contains only what helps in an emergency.
 */
export async function ensureCardToken(elder: Elder, rotate = false): Promise<string> {
  if (elder.cardToken && !rotate) return elder.cardToken;
  elder.cardToken = randomBytes(12).toString("base64url");
  await getRepo().putElder(elder);
  return elder.cardToken;
}

export const cardUrl = (elder: Elder) => `${env.PUBLIC_BASE_URL}/card/${elder.elderId}?k=${elder.cardToken}`;

export function tokenOk(elder: Elder | undefined, k: string | undefined): elder is Elder {
  if (!elder?.cardToken || !k) return false;
  const a = Buffer.from(elder.cardToken), b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function cardQrSvg(elder: Elder): Promise<string> {
  return QRCode.toString(cardUrl(elder), { type: "svg", margin: 1, color: { dark: "#1d1a16", light: "#ffffff" } });
}

export async function cardHtml(elder: Elder): Promise<string> {
  const repo = getRepo();
  const meds = (await repo.listMedications(elder.elderId)).filter((m) => m.active);
  const members = await repo.listMembers(elder.familyId);
  const contacts = members.filter((m) => m.phone).sort((a, b) => ["primary", "neighbour", "secondary"].indexOf(a.role) - ["primary", "neighbour", "secondary"].indexOf(b.role));
  const vit = await vitalsSummary(elder, 14);
  const e = escapeHtml;
  const row = (k: string, v: string) => `<div class="row"><span>${e(k)}</span><b>${v}</b></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emergency card · ${e(elder.name)}</title><meta name="robots" content="noindex">
<style>
:root{--ink:#1d1a16;--muted:#6b645b;--paper:#fffdf8;--line:#eadfce;--red:#c0392b}
@media (prefers-color-scheme:dark){:root{--ink:#f4efe6;--muted:#b3aa9c;--paper:#16130f;--line:#3a332a}}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink)}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
.sos{background:var(--red);color:#fff;border-radius:16px;padding:14px 16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:12px}
.sos a{color:#fff;background:rgba(255,255,255,.18);padding:8px 14px;border-radius:999px;text-decoration:none;white-space:nowrap}
h1{font-size:28px;margin:18px 0 2px}.sub{color:var(--muted);margin:0 0 16px}
section{border:1px solid var(--line);border-radius:16px;padding:12px 16px;margin-top:12px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:4px 0 8px}
.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.row span{color:var(--muted)}a.tel{color:inherit}.foot{color:var(--muted);font-size:13px;margin-top:18px}
</style></head><body><main>
<div class="sos"><span>In an emergency call 112</span><a href="tel:112">Call 112</a></div>
<h1>${e(elder.name)}${elder.age ? `, ${elder.age}` : ""}</h1><p class="sub">${e(elder.city)} · speaks ${e(elder.languages.map((l) => ({ kn: "Kannada", hi: "Hindi", en: "English" })[l]).join(", "))}</p>
<section><h2>Health</h2>${row("Conditions", e(elder.conditions.join(", ") || "none listed"))}${row("Allergies", e(elder.allergies?.join(", ") || "none known"))}${elder.bloodGroup ? row("Blood group", e(elder.bloodGroup)) : ""}</section>
<section><h2>Medicines</h2>${meds.map((m) => row(`${m.name} ${m.dose}`, e(m.slots.join(", ")))).join("") || "<p>None listed</p>"}</section>
${vit.kinds.length ? `<section><h2>Recent readings</h2>${vit.kinds.map((k) => row(k.label, e(k.latest?.text.replace(/^\S+\s/, "") ?? "—"))).join("")}</section>` : ""}
<section><h2>Call family</h2>${contacts.map((m) => row(`${m.name} (${m.relation})`, `<a class="tel" href="tel:${e(m.phone!)}">${e(m.phone!)}</a>`)).join("")}</section>
<p class="foot">Shared by ${e(elder.preferredName)}'s family through KaiseHo. Read-only; the family can turn this link off at any time.</p>
</main></body></html>`;
}
