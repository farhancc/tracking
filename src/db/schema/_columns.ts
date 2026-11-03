import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Primary key. Clients may supply their own UUID (idempotent offline inserts). */
export const pk = () => uuid("id").primaryKey().defaultRandom();

/**
 * Owner column. Defaults to the transaction-local user set by withUser(),
 * so application code never passes user_id and RLS can compare against it.
 */
export const ownerColumn = () =>
  uuid("user_id").notNull().default(sql`app.current_user_id()`);

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Renders a TS string tuple as a SQL IN-list for check constraints. */
export const inList = (values: readonly (string | number)[]) =>
  sql.raw(values.map((v) => (typeof v === "number" ? String(v) : `'${v}'`)).join(", "));
