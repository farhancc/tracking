import { asc, isNull } from "drizzle-orm";
import { habits } from "@/db/schema";
import { habitCreateSchema } from "@/features/habits/schemas";
import { createHabit } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/habits: active habits */
export const GET = apiRoute(({ tx }) => tx.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder), asc(habits.name)));

/** POST /api/v1/habits: { name, scheduleKind?: "days"|"weekly", scheduleDays?: [0–6], weeklyTarget?, startedOn?, description?, pillarId? } */
export const POST = apiRoute(async ({ tx, body }) => createHabit(tx, await body(habitCreateSchema)), { status: 201 });
