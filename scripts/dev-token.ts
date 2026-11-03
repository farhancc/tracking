/**
 * DEVELOPMENT ONLY: creates (or reuses) a user and a session, then prints a
 * Bearer token for calling the REST API with curl or a script.
 *
 *   npm run dev:token -- owner@localhost
 *   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/goals/tree
 */
import { config } from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { signAccessToken } from "../src/lib/auth/jwt";

config({ path: [".env.local", ".env"], quiet: true });

if (process.env.NODE_ENV === "production") {
  console.error("dev:token refuses to run with NODE_ENV=production.");
  process.exit(1);
}
const url = process.env.AUTH_DATABASE_URL;
if (!url) {
  console.error("AUTH_DATABASE_URL is not set.");
  process.exit(1);
}

const email = (process.argv[2] ?? process.env.FYOS_DEV_EMAIL ?? "owner@localhost").toLowerCase();
const hours = Number(process.env.DEV_TOKEN_HOURS ?? 12);
const pool = new Pool({ connectionString: url, max: 1 });

try {
  const existing = await pool.query<{ id: string; token_version: number }>(
    "select id, token_version from auth.users where lower(email) = $1",
    [email],
  );
  const user =
    existing.rows[0] ??
    (await pool.query<{ id: string; token_version: number }>(
      "insert into auth.users (email) values ($1) returning id, token_version",
      [email],
    )).rows[0];
  const session = await pool.query<{ id: string }>(
    `insert into auth.sessions (user_id, refresh_token_hash, user_agent, expires_at, absolute_expires_at)
     values ($1, $2, 'dev-token script', now() + make_interval(hours => $3), now() + make_interval(hours => $3))
     returning id`,
    [user.id, createHash("sha256").update(randomBytes(32)).digest("hex"), hours],
  );
  const token = await signAccessToken(
    { sub: user.id, sid: session.rows[0].id, ver: user.token_version, amr: ["dev"] },
    hours * 3600,
  );
  console.log(token);
} finally {
  await pool.end();
}
