import { config } from "dotenv";
import { runMigrations } from "../src/db/migrate";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set (owner role, Neon direct endpoint).");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrations applied.");
