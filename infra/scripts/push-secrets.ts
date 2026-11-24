/**
 * Copies the API keys from apps/server/.env into the "kaiseho/server" secret (Secrets Manager,
 * ap-south-1), so the cloud server gets the same keys without them ever touching git.
 *   pnpm --filter @kaiseho/infra secrets:push
 * Prints key NAMES only, never values.
 */
import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const KEYS = ["INTERNAL_TOKEN", "MCP_AGENT_TOKEN", "FAMILY_TOKEN_DEMO", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_BRIEFING_AGENT_ID",
  "ELEVENLABS_PHONE_NUMBER_ID", "ELEVENLABS_WEBHOOK_SECRET", "ELEVENLABS_DIGEST_VOICE_ID", "TELEGRAM_BOT_TOKEN", "TELEGRAM_DEMO_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET", "DEMO_ELDER_PHONE", "LLM_PROVIDER", "ANTHROPIC_API_KEY", "BEDROCK_MODEL_ID", "DIGEST_AUDIO"];

const env: Record<string, string> = {};
for (const line of readFileSync(resolve(import.meta.dirname, "../../apps/server/.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=([^#]*)/);
  if (m && m[2].trim()) env[m[1]] = m[2].trim();
}

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || "ap-south-1" });
const id = "kaiseho/server";
const current = JSON.parse((await sm.send(new GetSecretValueCommand({ SecretId: id }))).SecretString ?? "{}") as Record<string, string>;
const next = { ...current };
const pushed: string[] = [];
for (const k of KEYS) if (env[k]) { next[k] = env[k]; pushed.push(k); }
await sm.send(new PutSecretValueCommand({ SecretId: id, SecretString: JSON.stringify(next) }));
console.log(`✓ Updated secret ${id} with: ${pushed.join(", ")}`);
console.log("  Next: run the update command from docs/aws-runbook.md so the server reloads them.");
