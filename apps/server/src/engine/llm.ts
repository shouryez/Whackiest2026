import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { env } from "../env";

/**
 * One interface for every LLM job (plan.md Section 14): strict-JSON in, zod-validated out.
 * Providers: "anthropic" (Messages API) now; "bedrock" in Phase 4. With LLM_PROVIDER=none,
 * callers fall back to deterministic rules, so the demo never depends on an API key.
 * On a parse failure we retry once, then return null (callers degrade gracefully).
 */
export function llmEnabled(): boolean {
  if (env.LLM_PROVIDER === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  if (env.LLM_PROVIDER === "bedrock") return Boolean(env.BEDROCK_MODEL_ID);
  return false;
}

let bedrock: BedrockRuntimeClient | undefined;
/** AWS Bedrock (Converse API): the model runs inside AWS, so call data stays in our cloud account. */
async function callBedrock(system: string, user: string, timeoutMs: number): Promise<string> {
  bedrock ??= new BedrockRuntimeClient({ region: env.AWS_REGION });
  const r = await bedrock.send(
    new ConverseCommand({
      modelId: env.BEDROCK_MODEL_ID!,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 1500, temperature: 0.2 },
    }),
    { abortSignal: AbortSignal.timeout(timeoutMs) },
  );
  return (r.output?.message?.content ?? []).map((c) => ("text" in c ? c.text : "")).join("");
}

async function callAnthropic(system: string, user: string, timeoutMs: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.LLM_MODEL ?? "claude-haiku-5-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[] };
  return body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function llmJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<T | null> {
  if (!llmEnabled()) return null;
  const system = `${opts.system}\nReply with ONE JSON object only. No prose, no code fences.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const call = env.LLM_PROVIDER === "bedrock" ? callBedrock : callAnthropic;
      const text = await call(system, opts.user, opts.timeoutMs ?? 20000);
      const parsed = opts.schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      console.warn("[llm] schema mismatch", parsed.error.issues.slice(0, 3));
    } catch (err) {
      console.warn("[llm]", (err as Error).message);
      if ((err as Error).name === "TimeoutError") return null;
    }
  }
  return null;
}
