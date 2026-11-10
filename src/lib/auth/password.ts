/**
 * Password hashing (argon2id, OWASP baseline: m = 19 MiB, t = 2, p = 1) and the
 * password policy. See docs/06-security.md §3.1 and SEC-AUTH-01.
 */
import { hash, verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";

// algorithm 2 = Argon2id (the package exports it as a const enum, which isolatedModules cannot read).
export const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export function hashSecret(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

// A real argon2id hash of a random value, so a login for an unknown email costs the same as a real one.
let dummyHash: Promise<string> | undefined;
const dummy = () => (dummyHash ??= hashSecret(crypto.randomUUID()));

/** Verifies against a stored hash; with no hash, burns the same time and returns false (SEC-AUTH-09). */
export async function verifySecret(stored: string | null | undefined, plain: string): Promise<boolean> {
  try {
    if (!stored) {
      await verify(await dummy(), plain);
      return false;
    }
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

/** True when the stored hash was made with weaker parameters than today's and should be replaced. */
export function needsRehash(stored: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
  if (!m) return true;
  return Number(m[1]) < ARGON2_OPTIONS.memoryCost || Number(m[2]) < ARGON2_OPTIONS.timeCost;
}

export type PolicyResult = { ok: true } | { ok: false; message: string };

export function checkPasswordPolicy(password: string, email?: string): PolicyResult {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, message: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) {
    return { ok: false, message: "Don't include your email name in the password." };
  }
  if (new Set(password).size < 5) return { ok: false, message: "Use more varied characters." };
  return { ok: true };
}

/**
 * Pwned Passwords k-anonymity check: only the first 5 hex characters of the
 * SHA-1 leave the server. "unknown" when the service can't be reached; callers
 * decide whether to proceed (the CLI warns, it doesn't block).
 */
export async function breachCount(password: string, fetcher: typeof fetch = fetch): Promise<number | "unknown"> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return "unknown";
    const suffix = sha1.slice(5);
    for (const line of (await res.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch {
    return "unknown";
  }
}
