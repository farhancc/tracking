import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import type { Platform } from "@/lib/domain/content";
import type { ItemSort } from "@/lib/domain/content-analytics";
import type { ItemQuery } from "../schemas";
import { getAnalytics, type Window } from "./analytics";
import { getCalendar, getItem, getOverview, listItems, listPillars } from "./service";

export async function loadContentOverview() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getOverview(tx)) };
  });
}

export async function loadIdeas(q: ItemQuery) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, today: ws.today, pillars: await listPillars(tx), ideas: await listItems(tx, { ...q, ideasOnly: true }) };
  });
}

export async function loadCalendar(month?: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getCalendar(tx, month)) };
  });
}

export async function loadItem(id: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => ({ ...(await getItem(tx, id)), pillars: await listPillars(tx, true) }));
}

export async function loadAnalytics(q: { window?: Window; platform?: Platform; sort?: ItemSort }) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getAnalytics(tx, q)) };
  });
}
