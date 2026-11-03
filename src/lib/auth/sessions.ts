import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getAuthDatabase } from "@/db/auth-client";
import { sessions, users } from "@/db/schema";
import type { AccessClaims } from "./jwt";

/**
 * True when the session behind a verified token is still live: not revoked,
 * not expired, and issued for the user's current token_version. This is what
 * makes sign-out take effect immediately rather than after 15 minutes.
 */
export async function isSessionActive(claims: AccessClaims): Promise<boolean> {
  const db = getAuthDatabase();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, claims.sid),
        eq(sessions.userId, claims.sub),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.absoluteExpiresAt, sql`now()`),
        eq(users.tokenVersion, claims.ver),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await getAuthDatabase()
    .update(sessions)
    .set({ revokedAt: sql`now()`, revokeReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/**
 * Creates a session row. The login milestone adds refresh-token rotation;
 * until then the refresh token is generated, hashed and never handed out.
 */
export async function createSession(userId: string, meta: { userAgent?: string | null; days?: number }) {
  const db = getAuthDatabase();
  const refreshHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const days = meta.days ?? 30;
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash: refreshHash,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      expiresAt: sql`now() + make_interval(days => ${days})`,
      absoluteExpiresAt: sql`now() + interval '90 days'`,
    })
    .returning({ id: sessions.id });
  const [user] = await db.select({ ver: users.tokenVersion }).from(users).where(eq(users.id, userId));
  return { sessionId: row.id, tokenVersion: user.ver };
}

export async function findOrCreateUserByEmail(email: string): Promise<string> {
  const db = getAuthDatabase();
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db.insert(users).values({ email: normalized }).returning({ id: users.id });
  return created.id;
}
