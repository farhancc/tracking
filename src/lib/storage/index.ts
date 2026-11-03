/**
 * Private file storage for recordings and attachments.
 *
 * Drivers:
 *   - "local": files under STORAGE_LOCAL_DIR (default .data/uploads). For
 *     development and tests only; refused in production because serverless
 *     filesystems are ephemeral.
 *   - "s3": any S3-compatible bucket (Cloudflare R2, AWS S3, MinIO) using
 *     STORAGE_S3_* variables. The bucket stays private; files are streamed
 *     through authenticated API routes, never exposed by URL.
 *
 * Keys always start with the owner's user id: `{userId}/{kind}/{uuid}.{ext}`.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[0-9a-f-]{36}\/[a-z-]+\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

export function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error(`Unsafe storage key: ${key}`);
}

export function createLocalStorage(root: string): Storage {
  const resolve = (key: string) => {
    assertSafeKey(key);
    return path.join(root, key);
  };
  return {
    async put(key, body) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

export function createS3Storage(config: {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: Boolean(config.endpoint),
  });
  return {
    async put(key, body, contentType) {
      assertSafeKey(key);
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      assertSafeKey(key);
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : null;
      } catch (e) {
        if ((e as { name?: string }).name === "NoSuchKey") return null;
        throw e;
      }
    },
    async delete(key) {
      assertSafeKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const need = (name: string) => {
      const v = process.env[name];
      if (!v) throw new Error(`${name} is not set (required for STORAGE_DRIVER=s3).`);
      return v;
    };
    cached = createS3Storage({
      endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
      region: process.env.STORAGE_S3_REGION ?? "auto",
      bucket: need("STORAGE_S3_BUCKET"),
      accessKeyId: need("STORAGE_S3_ACCESS_KEY_ID"),
      secretAccessKey: need("STORAGE_S3_SECRET_ACCESS_KEY"),
    });
  } else {
    if (process.env.NODE_ENV === "production" && process.env.STORAGE_ALLOW_LOCAL !== "1") {
      throw new Error("Local file storage is disabled in production. Set STORAGE_DRIVER=s3 and the STORAGE_S3_* variables.");
    }
    // The directory is only known at runtime; tell Turbopack not to trace it into the bundle.
    cached = createLocalStorage(path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_LOCAL_DIR ?? ".data/uploads"));
  }
  return cached;
}

/** Allowed audio uploads and their file extensions. */
export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

/** Vercel functions accept request bodies up to 4.5 MB; stay under it. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
