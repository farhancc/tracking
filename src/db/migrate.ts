import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Pool } from "pg";

/** Applies drizzle/ migrations as the owner role (direct, unpooled connection). */
export async function runMigrations(connectionString: string, migrationsFolder = path.resolve("drizzle")) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
