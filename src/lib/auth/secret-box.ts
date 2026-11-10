/**
 * AES-256-GCM for the TOTP secret at rest. Key: AUTH_ENCRYPTION_KEY (32 bytes,
 * base64). Format: v1.<nonce>.<ciphertext+tag>, all base64url.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(raw = process.env.AUTH_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("AUTH_ENCRYPTION_KEY is not set. Run `npm run auth:keygen`.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("AUTH_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function seal(plain: string, rawKey?: string): string {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), nonce);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
  return `v1.${nonce.toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed: string, rawKey?: string): string {
  const [v, n, b] = sealed.split(".");
  if (v !== "v1" || !n || !b) throw new Error("Unknown sealed format.");
  const body = Buffer.from(b, "base64url");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(n, "base64url"));
  d.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString("utf8");
}
