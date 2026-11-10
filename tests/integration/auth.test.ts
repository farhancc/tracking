import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { createDatabase } from "../../src/db/drizzle";
import { authEvents, sessions, users } from "../../src/db/schema";
import { changePassword, completeMfa, confirmEnrollment, hitRateLimit, LOCK_AFTER, logoutEverywhere, passwordLogin, rotateRefresh, setOwnerCredentials, startEnrollment } from "../../src/lib/auth/login";
import { base32Decode, hotp, stepAt } from "../../src/lib/auth/totp";

const authPool = new Pool({ connectionString: inject("authUrl"), max: 2 });
const appPool = new Pool({ connectionString: inject("appUrl"), max: 1 });
const ownerPool = new Pool({ connectionString: inject("ownerUrl"), max: 1 });
const db = createDatabase(authPool);
afterAll(async () => {
  await authPool.end();
  await appPool.end();
  await ownerPool.end();
});
beforeAll(() => {
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
});

const meta = (ip = "203.0.113.0/24") => ({ ipPrefix: `${ip}-${randomUUID().slice(0, 8)}`, userAgent: "vitest" });
const PASSWORD = "plum-orbit-73-lantern";
const codeAt = (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), stepAt(new Date()) + offsetSteps);

/** A fresh owner with MFA enrolled. Each test uses its own email (the single-owner rule ignores @localhost). */
async function enrolledOwner() {
  const email = `${randomUUID().slice(0, 8)}@localhost`;
  const { userId } = await setOwnerCredentials(db, { email, password: PASSWORD });
  const login = await passwordLogin(db, email, PASSWORD, meta());
  expect(login).toMatchObject({ ok: true, enrolled: false });
  const start = await startEnrollment(db, userId);
  if (!start.ok) throw new Error("enrolment failed");
  const confirmed = await confirmEnrollment(db, userId, codeAt(start.secret, -1), meta());
  if (!confirmed.ok) throw new Error("confirm failed");
  return { email, userId, secret: start.secret, recoveryCodes: confirmed.recoveryCodes, session: confirmed.session };
}

describe("owner account", () => {
  it("allows exactly one real owner", async () => {
    await ownerPool.query("delete from auth.users where email not like '%@localhost' and email not like '%@test.local'");
    await setOwnerCredentials(db, { email: "Owner@Example.com", password: PASSWORD });
    await expect(setOwnerCredentials(db, { email: "intruder@example.com", password: PASSWORD })).rejects.toThrow(/exactly one owner/);
    // Re-running for the same owner updates the password instead.
    expect(await setOwnerCredentials(db, { email: "owner@example.com", password: `${PASSWORD}!` })).toMatchObject({ created: false });
    await ownerPool.query("delete from auth.users where lower(email) = 'owner@example.com'");
  });
});

describe("password step", () => {
  it("gives the same answer for unknown emails, wrong passwords and locked accounts, and locks with backoff", async () => {
    const o = await enrolledOwner();
    expect(await passwordLogin(db, "nobody@localhost", PASSWORD, meta())).toEqual({ ok: false, reason: "invalid" });
    for (let i = 0; i < LOCK_AFTER; i++) expect(await passwordLogin(db, o.email, "wrong password!!", meta())).toEqual({ ok: false, reason: "invalid" });
    const [u] = await db.select().from(users).where(eq(users.id, o.userId));
    expect(u.failedLoginCount).toBe(LOCK_AFTER);
    expect(u.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(50_000); // 1 minute
    // The right password is refused while locked, with the same generic answer.
    expect(await passwordLogin(db, o.email, PASSWORD, meta())).toEqual({ ok: false, reason: "invalid" });
    // Attempts during a lock don't extend it (so nobody can keep the owner locked out)…
    await passwordLogin(db, o.email, "wrong again!!!!", meta());
    const [held] = await db.select().from(users).where(eq(users.id, o.userId));
    expect(held.failedLoginCount).toBe(LOCK_AFTER);
    // …but a failure after the lock ends locks for longer (5 minutes).
    await db.update(users).set({ lockedUntil: sql`now() - interval '1 second'` }).where(eq(users.id, o.userId));
    await passwordLogin(db, o.email, "wrong again!!!!", meta());
    const [u2] = await db.select().from(users).where(eq(users.id, o.userId));
    expect(u2.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(4 * 60_000);
    // After the lock expires the right password works, and a full sign-in resets the counter.
    await db.update(users).set({ lockedUntil: sql`now() - interval '1 second'` }).where(eq(users.id, o.userId));
    expect(await passwordLogin(db, o.email, PASSWORD, meta())).toMatchObject({ ok: true, enrolled: true });
    const types = (await db.select({ t: authEvents.type }).from(authEvents).where(eq(authEvents.userId, o.userId))).map((r) => r.t);
    expect(types).toEqual(expect.arrayContaining(["login_fail", "account_locked", "login_locked", "password_ok", "mfa_enrolled"]));
  });

  it("rate-limits a network prefix to 20 auth requests per 10 minutes", async () => {
    const key = `ip:${randomUUID()}`;
    for (let i = 0; i < 20; i++) expect(await hitRateLimit(db, key)).toBe(true);
    expect(await hitRateLimit(db, key)).toBe(false);
  });
});

describe("second factor", () => {
  it("requires a fresh TOTP code, blocks replay, and accepts each recovery code once", async () => {
    const o = await enrolledOwner();
    expect(o.recoveryCodes).toHaveLength(10);
    // Setup used step-1; that step and older are spent.
    expect(await completeMfa(db, o.userId, { code: codeAt(o.secret, -1) }, meta())).toEqual({ ok: false, reason: "invalid" });
    const ok = await completeMfa(db, o.userId, { code: codeAt(o.secret) }, meta());
    expect(ok).toMatchObject({ ok: true, usedRecoveryCode: false });
    expect(await completeMfa(db, o.userId, { code: codeAt(o.secret) }, meta())).toEqual({ ok: false, reason: "invalid" }); // replay
    expect(await completeMfa(db, o.userId, { code: "000000" }, meta())).toEqual({ ok: false, reason: "invalid" });

    const rc = o.recoveryCodes[3].toUpperCase();
    expect(await completeMfa(db, o.userId, { recoveryCode: rc }, meta())).toMatchObject({ ok: true, usedRecoveryCode: true, recoveryCodesLeft: 9 });
    expect(await completeMfa(db, o.userId, { recoveryCode: rc }, meta())).toEqual({ ok: false, reason: "invalid" });
    // Enrolment can't be restarted once enabled (only the owner CLI resets it).
    expect(await startEnrollment(db, o.userId)).toEqual({ ok: false, reason: "already_enrolled" });
    // The TOTP secret is stored encrypted.
    const [u] = await db.select().from(users).where(eq(users.id, o.userId));
    expect(u.mfaTotpSecretEnc).toMatch(/^v1\./);
    expect(u.mfaTotpSecretEnc).not.toContain(o.secret);
  });
});

describe("refresh tokens", () => {
  it("rotate on use, tolerate parallel use for 30 s, and revoke the session on later reuse", async () => {
    const o = await enrolledOwner();
    const first = o.session.refreshToken;
    const r1 = await rotateRefresh(db, first, meta());
    if (!r1.ok || !r1.refreshToken) throw new Error("rotation failed");
    expect(r1.refreshToken).not.toBe(first);
    // A parallel request with the old token inside the grace window: access, no second rotation.
    expect(await rotateRefresh(db, first, meta())).toMatchObject({ ok: true, refreshToken: null, sessionId: r1.sessionId });
    // After the window, the old token is treated as stolen.
    await db.update(sessions).set({ rotatedAt: sql`now() - interval '2 minutes'` }).where(eq(sessions.id, r1.sessionId));
    expect(await rotateRefresh(db, first, meta())).toEqual({ ok: false, reason: "reuse" });
    // …and the whole session is gone, so the newest token stops working too.
    expect(await rotateRefresh(db, r1.refreshToken, meta())).toEqual({ ok: false, reason: "invalid" });
    expect(await rotateRefresh(db, "made-up-token", meta())).toEqual({ ok: false, reason: "invalid" });
    // Only hashes are stored.
    const [s] = await db.select().from(sessions).where(eq(sessions.id, r1.sessionId));
    expect(s.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.revokeReason).toBe("refresh_reuse");
  });

  it("stop working after sign-out everywhere or a password change", async () => {
    const o = await enrolledOwner();
    const other = await completeMfa(db, o.userId, { code: codeAt(o.secret) }, meta());
    if (!other.ok) throw new Error("second session failed");
    const changed = await changePassword(db, o.userId, { currentPassword: PASSWORD, newPassword: "new-river-58-compass", code: codeAt(o.secret, 1) }, meta());
    expect(changed.ok).toBe(true);
    expect(await rotateRefresh(db, other.session.refreshToken, meta())).toEqual({ ok: false, reason: "invalid" });
    expect(await passwordLogin(db, o.email, PASSWORD, meta())).toEqual({ ok: false, reason: "invalid" });
    expect(await passwordLogin(db, o.email, "new-river-58-compass", meta())).toMatchObject({ ok: true });
    if (!changed.ok) return;
    await logoutEverywhere(db, o.userId, meta());
    expect(await rotateRefresh(db, changed.session.refreshToken, meta())).toEqual({ ok: false, reason: "invalid" });
    const [u] = await db.select().from(users).where(eq(users.id, o.userId));
    expect(u.tokenVersion).toBeGreaterThanOrEqual(changed.session.tokenVersion + 1);
  });

  it("rejects a password change without the right code", async () => {
    const o = await enrolledOwner();
    expect(await changePassword(db, o.userId, { currentPassword: PASSWORD, newPassword: "new-river-58-compass", code: "123456" }, meta())).toEqual({ ok: false, reason: "invalid" });
    expect(await changePassword(db, o.userId, { currentPassword: "wrong!!!!!!!!", newPassword: "new-river-58-compass", code: codeAt(o.secret, 1) }, meta())).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("privileges", () => {
  it("keeps auth tables away from the app role", async () => {
    for (const table of ["auth.users", "auth.sessions", "auth.events", "auth.recovery_codes", "auth.rate_limits"]) {
      await expect(appPool.query(`select 1 from ${table} limit 1`)).rejects.toThrow(/permission denied/);
    }
  });
});
