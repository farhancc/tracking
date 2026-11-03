import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { inject } from "vitest";
import { createDatabase, runAsUser, type Tx } from "../../src/db/drizzle";
import { createJourney } from "../../src/features/goals/server/service";

export function connect() {
  const ownerPool = new Pool({ connectionString: inject("ownerUrl"), max: 2 });
  const appPool = new Pool({ connectionString: inject("appUrl"), max: 4 });
  const appDb = createDatabase(appPool);

  async function newUser(): Promise<string> {
    const id = randomUUID();
    await ownerPool.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
    return id;
  }

  const as = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => runAsUser(appDb, userId, fn);

  /** A user with an active journey 2027-01-01 → 2031-12-31 and the default pillars. */
  async function newOwner() {
    const userId = await newUser();
    const ws = await as(userId, (tx) =>
      createJourney(tx, {
        name: "Test journey",
        startDate: "2027-01-01",
        timezone: "UTC",
        baseCurrency: "USD",
        weekStartsOn: 1,
        displayName: null,
      }),
    );
    const pillar = (key: string) => ws.pillars.find((p) => p.key === key)!.id;
    return { userId, ws, pillar };
  }

  async function close() {
    await appPool.end();
    await ownerPool.end();
  }

  return { ownerPool, appPool, appDb, as, newUser, newOwner, close };
}

/** Expects `promise` to reject with an AppError-mappable database error carrying `detail` or `constraint`. */
export async function rejectsWith(promise: Promise<unknown>, match: { detail?: string; constraint?: string; code?: string }) {
  try {
    await promise;
  } catch (e) {
    let err: unknown = e;
    for (let i = 0; i < 4 && err; i++) {
      const pg = err as { code?: string; detail?: string; constraint?: string; severity?: string };
      if (pg.severity) {
        if (match.detail && pg.detail !== match.detail) throw new Error(`Expected detail ${match.detail}, got ${pg.detail}: ${String(e)}`);
        if (match.constraint && pg.constraint !== match.constraint)
          throw new Error(`Expected constraint ${match.constraint}, got ${pg.constraint}`);
        if (match.code && pg.code !== match.code) throw new Error(`Expected code ${match.code}, got ${pg.code}`);
        return pg;
      }
      err = (err as { cause?: unknown }).cause;
    }
    throw e;
  }
  throw new Error("Expected the operation to fail, but it succeeded.");
}
