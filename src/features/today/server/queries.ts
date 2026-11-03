import "server-only";
import { eq, sum } from "drizzle-orm";
import { withUser } from "@/db/client";
import { readingSessions } from "@/db/schema";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getToday } from "./service";

export async function loadToday(day?: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getToday(tx, day)) };
  });
}

/** Today plus minutes read today, for the quick check-in. */
export async function loadCheckin() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    const today = await getToday(tx);
    const [{ minutes }] = await tx.select({ minutes: sum(readingSessions.minutes).mapWith(Number) }).from(readingSessions).where(eq(readingSessions.readOn, today.day));
    return { ready: true as const, ...today, readingMinutes: minutes ?? 0 };
  });
}
