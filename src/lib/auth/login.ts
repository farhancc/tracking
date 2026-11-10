/**
 * Login, MFA, refresh rotation and account security flows (docs/06 §3.3).
 * Every function takes the fyos_auth database explicitly so tests and the
 * owner CLI can use them; route handlers pass getAuthDatabase().
 */
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Database } from "@/db/drizzle";
import { authEvents, rateLimits, recoveryCodes, sessions, users } from "@/db/schema";
import { checkPasswordPolicy, hashSecret, needsRehash, verifySecret } from "./password";
import type { RequestMeta } from "./request-meta";
import { open, seal } from "./secret-box";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from "./totp";

export const LOCK_AFTER = 5;
const LOCK_MINUTES = [1, 5, 15, 60];
export const RATE_LIMIT = { requests: 20, windowMinutes: 10 };
export const REFRESH_GRACE_SECONDS = 30;
const SLIDING_DAYS = 30;
const ABSOLUTE_DAYS = 90;

export type NewSession = { sessionId: string; refreshToken: string; tokenVersion: number; userId: string };
type Fail<R extends string> = { ok: false; reason: R };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newRefreshToken = () => randomBytes(32).toString("base64url");
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function logEvent(db: Database, type: string, meta: RequestMeta, userId: string | null, detail: Record<string, unknown> = {}, sessionId: string | null = null) {
  await db.insert(authEvents).values({ type, userId, sessionId, ipPrefix: meta.ipPrefix, userAgent: meta.userAgent, detail });
}

/** Fixed-window counter per key. Returns false once the limit is exceeded. */
export async function hitRateLimit(db: Database, key: string, limit = RATE_LIMIT.requests, windowMinutes = RATE_LIMIT.windowMinutes): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    insert into auth.rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowMinutes * 60}) * ${windowMinutes * 60}), 1)
    on conflict (key, window_start) do update set count = auth.rate_limits.count + 1
    returning count`);
  // Old windows are cleaned up opportunistically.
  if (Math.random() < 0.02) await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
  return Number(rows.rows[0].count) <= limit;
}

async function userByEmail(db: Database, email: string) {
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizeEmail(email)}`).limit(1);
  return u ?? null;
}

async function recordFailure(db: Database, userId: string, meta: RequestMeta, type: string) {
  const [u] = await db
    .update(users)
    .set({ failedLoginCount: sql`${users.failedLoginCount} + 1`, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning({ count: users.failedLoginCount });
  if (u.count >= LOCK_AFTER) {
    const minutes = LOCK_MINUTES[Math.min(u.count - LOCK_AFTER, LOCK_MINUTES.length - 1)];
    await db.update(users).set({ lockedUntil: sql`now() + make_interval(mins => ${minutes})` }).where(eq(users.id, userId));
    await logEvent(db, "account_locked", meta, userId, { minutes, failures: u.count });
  }
  await logEvent(db, type, meta, userId);
}

const isLocked = (u: { lockedUntil: Date | null }) => !!u.lockedUntil && u.lockedUntil.getTime() > Date.now();

/** Step 1. The same answer and the same cost whether or not the email exists or the account is locked. */
export async function passwordLogin(db: Database, email: string, password: string, meta: RequestMeta): Promise<{ ok: true; userId: string; enrolled: boolean } | Fail<"invalid" | "rate_limited">> {
  if (meta.ipPrefix && !(await hitRateLimit(db, `ip:${meta.ipPrefix}`))) {
    await logEvent(db, "rate_limited", meta, null);
    return { ok: false, reason: "rate_limited" };
  }
  const u = await userByEmail(db, email);
  const valid = await verifySecret(u?.passwordHash, password);
  if (!u) {
    await logEvent(db, "login_fail", meta, null, { unknownEmail: true });
    return { ok: false, reason: "invalid" };
  }
  if (isLocked(u)) {
    await logEvent(db, "login_locked", meta, u.id);
    return { ok: false, reason: "invalid" };
  }
  if (!valid) {
    await recordFailure(db, u.id, meta, "login_fail");
    return { ok: false, reason: "invalid" };
  }
  if (needsRehash(u.passwordHash!)) await db.update(users).set({ passwordHash: await hashSecret(password) }).where(eq(users.id, u.id));
  await logEvent(db, "password_ok", meta, u.id);
  return { ok: true, userId: u.id, enrolled: !!u.mfaEnabledAt && !!u.mfaTotpSecretEnc };
}

export async function createSessionFor(db: Database, userId: string, meta: RequestMeta): Promise<NewSession> {
  const refreshToken = newRefreshToken();
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash: sha256(refreshToken),
      aal: 2,
      userAgent: meta.userAgent,
      ipPrefix: meta.ipPrefix,
      expiresAt: sql`now() + make_interval(days => ${SLIDING_DAYS})`,
      absoluteExpiresAt: sql`now() + make_interval(days => ${ABSOLUTE_DAYS})`,
    })
    .returning({ id: sessions.id });
  const [u] = await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning({ ver: users.tokenVersion });
  return { sessionId: row.id, refreshToken, tokenVersion: u.ver, userId };
}

/** Step 2: a TOTP code or a single-use recovery code. */
export async function completeMfa(db: Database, userId: string, input: { code?: string; recoveryCode?: string }, meta: RequestMeta): Promise<{ ok: true; session: NewSession; usedRecoveryCode: boolean; recoveryCodesLeft: number } | Fail<"invalid" | "rate_limited" | "not_enrolled">> {
  if (meta.ipPrefix && !(await hitRateLimit(db, `ip:${meta.ipPrefix}`))) return { ok: false, reason: "rate_limited" };
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return { ok: false, reason: "invalid" };
  if (!u.mfaEnabledAt || !u.mfaTotpSecretEnc) return { ok: false, reason: "not_enrolled" };
  if (isLocked(u)) {
    await logEvent(db, "login_locked", meta, u.id, { step: "mfa" });
    return { ok: false, reason: "invalid" };
  }
  let usedRecoveryCode = false;
  if (input.code) {
    const step = verifyTotp(open(u.mfaTotpSecretEnc), input.code, u.mfaLastUsedStep);
    if (step === null) {
      await recordFailure(db, u.id, meta, "mfa_fail");
      return { ok: false, reason: "invalid" };
    }
    // Conditional update so two requests with the same code can't both pass (replay).
    const claimed = await db
      .update(users)
      .set({ mfaLastUsedStep: step })
      .where(and(eq(users.id, u.id), sql`coalesce(${users.mfaLastUsedStep}, -1) < ${step}`))
      .returning({ id: users.id });
    if (!claimed.length) {
      await recordFailure(db, u.id, meta, "mfa_replay");
      return { ok: false, reason: "invalid" };
    }
  } else if (input.recoveryCode) {
    const wanted = normalizeRecoveryCode(input.recoveryCode);
    const codes = await db.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId, u.id), isNull(recoveryCodes.usedAt)));
    let match: string | null = null;
    for (const c of codes) if (!match && (await verifySecret(c.codeHash, wanted))) match = c.id;
    const used = match ? await db.update(recoveryCodes).set({ usedAt: sql`now()` }).where(and(eq(recoveryCodes.id, match), isNull(recoveryCodes.usedAt))).returning({ id: recoveryCodes.id }) : [];
    if (!used.length) {
      await recordFailure(db, u.id, meta, "recovery_fail");
      return { ok: false, reason: "invalid" };
    }
    usedRecoveryCode = true;
  } else return { ok: false, reason: "invalid" };

  const session = await createSessionFor(db, u.id, meta);
  await logEvent(db, usedRecoveryCode ? "recovery_code_used" : "mfa_ok", meta, u.id, {}, session.sessionId);
  const left = await db.select({ id: recoveryCodes.id }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, u.id), isNull(recoveryCodes.usedAt)));
  return { ok: true, session, usedRecoveryCode, recoveryCodesLeft: left.length };
}

/** First login: a new secret for the QR code. Refused once MFA is enabled (reset needs the owner CLI). */
export async function startEnrollment(db: Database, userId: string): Promise<{ ok: true; secret: string; otpauthUrl: string } | Fail<"already_enrolled">> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.mfaEnabledAt) return { ok: false, reason: "already_enrolled" };
  const secret = generateTotpSecret();
  await db.update(users).set({ mfaTotpSecretEnc: seal(secret), mfaLastUsedStep: null }).where(eq(users.id, userId));
  return { ok: true, secret, otpauthUrl: otpauthUrl(secret, u.email) };
}

async function replaceRecoveryCodes(db: Database, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  const hashes = await Promise.all(codes.map((c) => hashSecret(normalizeRecoveryCode(c))));
  await db.insert(recoveryCodes).values(hashes.map((codeHash) => ({ userId, codeHash })));
  return codes;
}

/** Confirms the authenticator with one code, enables MFA, returns the recovery codes (shown once) and a session. */
export async function confirmEnrollment(db: Database, userId: string, code: string, meta: RequestMeta): Promise<{ ok: true; recoveryCodes: string[]; session: NewSession } | Fail<"invalid" | "already_enrolled" | "rate_limited">> {
  if (meta.ipPrefix && !(await hitRateLimit(db, `ip:${meta.ipPrefix}`))) return { ok: false, reason: "rate_limited" };
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.mfaEnabledAt || !u.mfaTotpSecretEnc) return { ok: false, reason: u?.mfaEnabledAt ? "already_enrolled" : "invalid" };
  const step = verifyTotp(open(u.mfaTotpSecretEnc), code, u.mfaLastUsedStep);
  if (step === null) {
    await recordFailure(db, u.id, meta, "mfa_setup_fail");
    return { ok: false, reason: "invalid" };
  }
  await db.update(users).set({ mfaEnabledAt: sql`now()`, mfaLastUsedStep: step }).where(eq(users.id, u.id));
  const codes = await replaceRecoveryCodes(db, u.id);
  const session = await createSessionFor(db, u.id, meta);
  await logEvent(db, "mfa_enrolled", meta, u.id, {}, session.sessionId);
  return { ok: true, recoveryCodes: codes, session };
}

/**
 * Rotates a refresh token. Presenting the previous token within the grace
 * window (parallel tabs) gets an access token without another rotation;
 * after the window it is treated as theft and the session is revoked.
 */
export async function rotateRefresh(db: Database, token: string, meta: RequestMeta): Promise<{ ok: true; userId: string; sessionId: string; tokenVersion: number; refreshToken: string | null } | Fail<"invalid" | "reuse">> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid" };
  const h = sha256(token);
  const [row] = await db
    .select({ s: sessions, ver: users.tokenVersion })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(sql`${sessions.refreshTokenHash} = ${h} or ${sessions.previousRefreshTokenHash} = ${h}`)
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };
  const s = row.s;
  const live = !s.revokedAt && s.expiresAt.getTime() > Date.now() && s.absoluteExpiresAt.getTime() > Date.now();
  if (!live) return { ok: false, reason: "invalid" };
  const eqHash = (a: string | null) => !!a && timingSafeEqual(Buffer.from(a), Buffer.from(h));

  if (eqHash(s.previousRefreshTokenHash) && !eqHash(s.refreshTokenHash)) {
    const withinGrace = s.rotatedAt && Date.now() - s.rotatedAt.getTime() <= REFRESH_GRACE_SECONDS * 1000;
    if (withinGrace) return { ok: true, userId: s.userId, sessionId: s.id, tokenVersion: row.ver, refreshToken: null };
    await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "refresh_reuse" }).where(eq(sessions.id, s.id));
    await logEvent(db, "reuse_detected", meta, s.userId, {}, s.id);
    return { ok: false, reason: "reuse" };
  }

  const next = newRefreshToken();
  // Conditional on the current hash so two concurrent rotations can't both win.
  const updated = await db
    .update(sessions)
    .set({
      refreshTokenHash: sha256(next),
      previousRefreshTokenHash: h,
      rotatedAt: sql`now()`,
      lastUsedAt: sql`now()`,
      expiresAt: sql`least(now() + make_interval(days => ${SLIDING_DAYS}), ${sessions.absoluteExpiresAt})`,
      ipPrefix: meta.ipPrefix ?? s.ipPrefix,
    })
    .where(and(eq(sessions.id, s.id), eq(sessions.refreshTokenHash, h)))
    .returning({ id: sessions.id });
  if (!updated.length) return { ok: true, userId: s.userId, sessionId: s.id, tokenVersion: row.ver, refreshToken: null };
  return { ok: true, userId: s.userId, sessionId: s.id, tokenVersion: row.ver, refreshToken: next };
}

export async function logout(db: Database, sessionId: string, meta: RequestMeta) {
  const [s] = await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "logout" }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt))).returning({ userId: sessions.userId });
  if (s) await logEvent(db, "logout", meta, s.userId, {}, sessionId);
}

export async function logoutEverywhere(db: Database, userId: string, meta: RequestMeta) {
  await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "logout_all" }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await db.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, userId));
  await logEvent(db, "logout_all", meta, userId);
}

export async function revokeOwnSession(db: Database, userId: string, sessionId: string, meta: RequestMeta) {
  const rows = await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "revoked_by_owner" }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt))).returning({ id: sessions.id });
  if (rows.length) await logEvent(db, "session_revoked", meta, userId, {}, sessionId);
  return rows.length > 0;
}

/** Needs the current password and a TOTP code. Signs out every device, then issues a fresh session for this one. */
export async function changePassword(db: Database, userId: string, input: { currentPassword: string; newPassword: string; code: string }, meta: RequestMeta): Promise<{ ok: true; session: NewSession } | Fail<"invalid" | "policy">> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.mfaTotpSecretEnc) return { ok: false, reason: "invalid" };
  if (!(await verifySecret(u.passwordHash, input.currentPassword))) {
    await recordFailure(db, u.id, meta, "password_change_fail");
    return { ok: false, reason: "invalid" };
  }
  const step = verifyTotp(open(u.mfaTotpSecretEnc), input.code, u.mfaLastUsedStep);
  if (step === null) {
    await recordFailure(db, u.id, meta, "password_change_fail");
    return { ok: false, reason: "invalid" };
  }
  if (!checkPasswordPolicy(input.newPassword, u.email).ok) return { ok: false, reason: "policy" };
  await db
    .update(users)
    .set({ passwordHash: await hashSecret(input.newPassword), passwordChangedAt: sql`now()`, mfaLastUsedStep: step, tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, u.id));
  await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "password_changed" }).where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt)));
  const session = await createSessionFor(db, u.id, meta);
  await logEvent(db, "password_changed", meta, u.id, {}, session.sessionId);
  return { ok: true, session };
}

export async function securityOverview(db: Database, userId: string) {
  const active = await db
    .select({ id: sessions.id, userAgent: sessions.userAgent, ipPrefix: sessions.ipPrefix, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`now()`), gt(sessions.absoluteExpiresAt, sql`now()`)))
    .orderBy(desc(sessions.lastUsedAt));
  const events = await db.select({ type: authEvents.type, ipPrefix: authEvents.ipPrefix, userAgent: authEvents.userAgent, createdAt: authEvents.createdAt }).from(authEvents).where(eq(authEvents.userId, userId)).orderBy(desc(authEvents.createdAt)).limit(50);
  const [u] = await db.select({ email: users.email, mfaEnabledAt: users.mfaEnabledAt, passwordChangedAt: users.passwordChangedAt }).from(users).where(eq(users.id, userId));
  const left = await db.select({ id: recoveryCodes.id }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return { email: u?.email ?? null, mfaEnabledAt: u?.mfaEnabledAt ?? null, passwordChangedAt: u?.passwordChangedAt ?? null, recoveryCodesLeft: left.length, sessions: active, events };
}

/** New recovery codes (old ones stop working). Needs a TOTP code. */
export async function regenerateRecoveryCodes(db: Database, userId: string, code: string, meta: RequestMeta): Promise<{ ok: true; recoveryCodes: string[] } | Fail<"invalid">> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.mfaTotpSecretEnc) return { ok: false, reason: "invalid" };
  const step = verifyTotp(open(u.mfaTotpSecretEnc), code, u.mfaLastUsedStep);
  if (step === null) {
    await recordFailure(db, u.id, meta, "mfa_fail");
    return { ok: false, reason: "invalid" };
  }
  await db.update(users).set({ mfaLastUsedStep: step }).where(eq(users.id, u.id));
  const codes = await replaceRecoveryCodes(db, u.id);
  await logEvent(db, "recovery_codes_regenerated", meta, u.id);
  return { ok: true, recoveryCodes: codes };
}

/** Owner CLI: create the single owner or set the password; optionally reset MFA. Signs out every device. */
export async function setOwnerCredentials(db: Database, input: { email: string; password: string; resetMfa?: boolean }) {
  const email = normalizeEmail(input.email);
  const existing = await db.select({ id: users.id, email: users.email, hasPassword: sql<boolean>`${users.passwordHash} is not null` }).from(users);
  const same = existing.find((u) => u.email.toLowerCase() === email);
  // An owner is an account that can sign in (has a password). Local development accounts (@localhost) don't count.
  const others = existing.filter((u) => u.hasPassword && u.email.toLowerCase() !== email && !u.email.endsWith("@localhost"));
  if (!same && others.length) throw new Error(`An owner already exists (${others[0].email}). FiveYearOS has exactly one owner.`);
  const passwordHash = await hashSecret(input.password);
  const mfaReset = input.resetMfa ? { mfaTotpSecretEnc: null, mfaEnabledAt: null, mfaLastUsedStep: null } : {};
  let userId: string;
  if (same) {
    await db.update(users).set({ passwordHash, passwordChangedAt: sql`now()`, failedLoginCount: 0, lockedUntil: null, tokenVersion: sql`${users.tokenVersion} + 1`, ...mfaReset }).where(eq(users.id, same.id));
    userId = same.id;
  } else {
    const [row] = await db.insert(users).values({ email, passwordHash, passwordChangedAt: sql`now()` }).returning({ id: users.id });
    userId = row.id;
  }
  if (input.resetMfa) await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db.update(sessions).set({ revokedAt: sql`now()`, revokeReason: "owner_cli" }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await logEvent(db, same ? "owner_reset" : "owner_created", { ipPrefix: null, userAgent: "cli" }, userId, { resetMfa: !!input.resetMfa });
  return { userId, created: !same };
}
