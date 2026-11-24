import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  PUBLIC_BASE_URL: z.string().default("http://localhost:8787"),
  DASHBOARD_URL: z.string().default("http://localhost:3000"),
  DATA_STORE: z.enum(["memory", "dynamo"]).default("memory"),
  DEMO_MODE: bool.default("true"),
  INTERNAL_TOKEN: z.string().default("dev-internal-token"),
  MCP_AGENT_TOKEN: z.string().default("dev-agent-token"),
  FAMILY_TOKEN_DEMO: z.string().default("dev-family-token"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_PHONE_NUMBER_ID: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
  ELEVENLABS_API_BASE: z.string().default("https://api.elevenlabs.io"),

  ELEVENLABS_BRIEFING_AGENT_ID: z.string().optional(),
  ELEVENLABS_DIGEST_VOICE_ID: z.string().optional(),
  ELEVENLABS_TTS_MODEL: z.string().default("eleven_multilingual_v2"),
  /** Local files (digest MP3s) until S3 in Phase 4. */
  DATA_DIR: z.string().default(".data"),
  /** Weekly digest time (elder's local time). */
  DIGEST_DAY: z.coerce.number().int().min(0).max(6).default(0),
  DIGEST_TIME: z.string().default("20:00"),

  /** LLM for the post-call insight pass, starters and scam layer 2. "none" = deterministic rules only. */
  LLM_PROVIDER: z.enum(["none", "anthropic", "bedrock", "openai"]).default("none"),
  LLM_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  /** Local scheduler (setTimeout/interval) for daily calls, reminders, callbacks, retries. Off in demo by default. */
  ENABLE_DAILY_CALLS: bool.default("false"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().default("dev-telegram-secret"),
  /** Phase 0 shortcut: chat id that receives the primary child's alerts until /start linking exists (Phase 2). */
  TELEGRAM_DEMO_CHAT_ID: z.string().optional(),

  TRANSCRIPT_RETENTION_HOURS: z.coerce.number().default(24),
  RETRY_MINUTES: z.coerce.number().default(15),
  TIMEZONE_DEFAULT: z.string().default("Asia/Kolkata"),
});

export type Env = z.infer<typeof EnvSchema>;

// Empty strings in .env mean "unset".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
export const env: Env = EnvSchema.parse(raw);
