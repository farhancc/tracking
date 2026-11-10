import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction whose first statement sets the transaction-local
 * `app.user_id`. Every RLS policy compares against it, so queries inside see
 * and change only this user's rows. `true` (is_local) makes the setting die
 * with the transaction, which is what makes Neon's transaction-mode pooler safe.
 */
export async function runAsUser<T>(database: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("runAsUser: userId must be a UUID");
  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Serialises "create defaults on first use" code across concurrent requests
 * for the same user (e.g. a page render and a prefetch). Transaction-scoped:
 * released at commit or rollback.
 */
export async function lockForUser(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key} || ':' || app.current_user_id()::text))`);
}
