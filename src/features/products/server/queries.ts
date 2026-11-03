import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace, listGoals } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getPortfolio, getProduct, getReport } from "./service";
import { getValidation } from "./validation";

export async function loadPortfolio() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, baseCurrency: ws.profile?.baseCurrency ?? "USD", ...(await getPortfolio(tx)) };
  });
}

export async function loadProduct(id: string, range: { from?: string; to?: string }) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const detail = await getProduct(tx, id);
    const report = await getReport(tx, id, range);
    const validation = await getValidation(tx, id);
    const goals = await listGoals(tx, {});
    return { ...detail, report, validation, goals: goals.map((g) => ({ id: g.id, title: g.title, level: g.level })) };
  });
}
