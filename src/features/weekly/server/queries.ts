import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { weekOf } from "@/lib/domain/weekly";
import { getWeek, listRecentWeeks } from "./service";

export async function loadWeek(weekStart?: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    // Any date in a week opens that week.
    const week = await getWeek(tx, weekStart ? weekOf(weekStart, ws.weekStartsOn).weekStart : undefined);
    const trend = await listRecentWeeks(tx, 8);
    return { ready: true as const, ...week, trend };
  });
}
