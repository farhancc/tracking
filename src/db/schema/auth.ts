/**
 * Identity tables (schema `auth`). Reachable only by the fyos_auth role.
 * Login looks users up by email before anyone is authenticated, so these
 * tables are isolated by privileges rather than RLS. See docs/06-security.md §3–4.
 *
 * users + sessions (request authentication), recovery codes (MFA fallback),
 * events (audit log shown in Settings → Security) and rate limits (per IP
 * prefix).
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgSchema, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");

export const users = authSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    mfaTotpSecretEnc: text("mfa_totp_secret_enc"),
    mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
    mfaLastUsedStep: integer("mfa_last_used_step"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    tokenVersion: integer("token_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`)],
);

export const sessions = authSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    previousRefreshTokenHash: text("previous_refresh_token_hash"),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    aal: smallint("aal").notNull().default(2),
    userAgent: text("user_agent"),
    ipPrefix: text("ip_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Single-use MFA recovery codes, argon2id-hashed. */
export const recoveryCodes = authSchema.table(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)],
);

/** Audit log of authentication events (no secrets, no tokens). */
export const authEvents = authSchema.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    type: text("type").notNull(),
    ipPrefix: text("ip_prefix"),
    userAgent: text("user_agent"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_user_created_idx").on(t.userId, t.createdAt)],
);

/** Fixed-window request counters per IP prefix and bucket. */
export const rateLimits = authSchema.table(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
