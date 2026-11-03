import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getHabitHistory, getHabitsOverview } from "./service";

export async function loadHabits() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getHabitsOverview(tx)) };
  });
}

export async function loadHabit(id: string) {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => getHabitHistory(tx, id));
}
