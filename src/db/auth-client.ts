import "server-only";
import { Pool } from "pg";
import { createDatabase, type Database } from "./drizzle";

const globalForDb = globalThis as unknown as { __fyosAuthPool?: Pool };
let database: Database | undefined;

/**
 * Connection as the fyos_auth role: auth.* tables only. Import from
 * src/lib/auth only (enforced by ESLint).
 */
export function getAuthDatabase(): Database {
  if (!database) {
    const connectionString = process.env.AUTH_DATABASE_URL;
    if (!connectionString) throw new Error("AUTH_DATABASE_URL is not set (fyos_auth role, Neon pooled endpoint).");
    const pool = globalForDb.__fyosAuthPool ?? new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
    globalForDb.__fyosAuthPool = pool;
    database = createDatabase(pool);
  }
  return database;
}
