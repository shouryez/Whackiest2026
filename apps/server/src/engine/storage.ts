import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../env";

/**
 * Blob storage for digest MP3s (and later prescription photos): S3 (private bucket in
 * ap-south-1) when S3_BUCKET is set, the local DATA_DIR otherwise.
 */
let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({ region: env.AWS_REGION }));
const SAFE = /^[\w-]+(\/[\w-]+)*\.(mp3|jpg|png|json|webm|ogg|m4a|wav)$/;

export async function putBlob(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!SAFE.test(key)) throw new Error("bad key");
  if (env.S3_BUCKET) {
    await client().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
    return;
  }
  const path = resolve(env.DATA_DIR, key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, body);
}

export async function getBlob(key: string): Promise<Buffer | null> {
  if (!SAFE.test(key)) return null;
  try {
    if (env.S3_BUCKET) {
      const r = await client().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return await readFile(resolve(env.DATA_DIR, key));
  } catch {
    return null;
  }
}
