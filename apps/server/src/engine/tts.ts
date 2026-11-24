import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../env";

/**
 * ElevenLabs text-to-speech for the weekly audio digest (plan.md P1-8), same brand voice as
 * the agent. Files are written under DATA_DIR/digests (S3 in Phase 4). Verify the request
 * shape against the current TTS API reference.
 */
export function ttsReady(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_DIGEST_VOICE_ID);
}

const dir = () => resolve(env.DATA_DIR, "digests");

export async function synthesize(text: string, fileId: string): Promise<{ file: string; bytes: number; voice: string } | null> {
  if (!ttsReady()) return null;
  try {
    const res = await fetch(`${env.ELEVENLABS_API_BASE}/v1/text-to-speech/${env.ELEVENLABS_DIGEST_VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.warn("[tts]", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dir(), { recursive: true });
    const file = `${fileId.replace(/[^\w-]/g, "")}.mp3`;
    await writeFile(join(dir(), file), buf);
    return { file, bytes: buf.length, voice: env.ELEVENLABS_DIGEST_VOICE_ID! };
  } catch (err) {
    console.warn("[tts]", (err as Error).message);
    return null;
  }
}

export async function readAudio(file: string): Promise<Buffer | null> {
  if (!/^[\w-]+\.mp3$/.test(file)) return null;
  try {
    return await readFile(join(dir(), file));
  } catch {
    return null;
  }
}
