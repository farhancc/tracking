import "server-only";
import { Pool } from "pg";
import { createDatabase, runAsUser, type Database, type Tx } from "./drizzle";

export type { Tx };

const globalForDb = globalThis as unknown as { __fyosAppPool?: Pool };
let database: Database | undefined;

function getDatabase(): Database {
  if (!database) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set (fyos_app role, Neon pooled endpoint).");
    const pool = globalForDb.__fyosAppPool ?? new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
    globalForDb.__fyosAppPool = pool;
    database = createDatabase(pool);
  }
  return database;
}

/** The only way application code reaches the database. See docs/05 §4. */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsUser(getDatabase(), userId, fn);
}
