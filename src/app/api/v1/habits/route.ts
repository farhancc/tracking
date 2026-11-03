import { asc, isNull } from "drizzle-orm";
import { habits } from "@/db/schema";
import { habitCreateSchema } from "@/features/today/schemas";
import { createHabit } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/habits */
export const GET = apiRoute(({ tx }) => tx.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder), asc(habits.name)));

/** POST /api/v1/habits: { name, scheduleDays: [0–6], pillarId?, description? } */
export const POST = apiRoute(async ({ tx, body }) => createHabit(tx, await body(habitCreateSchema)), { status: 201 });
