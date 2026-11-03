import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import type { SalesPeriod } from "@/lib/domain/sales";
import { listPublishedContent } from "@/features/content/server/service";
import { getDashboard, listJournal, listProspects } from "./service";

export async function loadSalesDashboard(query: { period: SalesPeriod; anchor?: string; trackId?: string }) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    const dashboard = await getDashboard(tx, query);
    const prospects = await listProspects(tx, { trackId: dashboard.track?.id });
    const content = await listPublishedContent(tx);
    return { ready: true as const, ...dashboard, prospects, content };
  });
}

export async function loadJournal(filter: { kind?: string; q?: string; tag?: string }) {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => listJournal(tx, filter));
}
