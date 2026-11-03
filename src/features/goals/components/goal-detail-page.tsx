import { notFound } from "next/navigation";
import { loadGoalDetail } from "../server/queries";
import { GoalDetailView } from "./goal-detail";

export async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadGoalDetail(id).catch((e: { status?: number; code?: string }) => {
    if (e?.status === 404 || e?.code === "journey_required") notFound();
    throw e;
  });
  return <GoalDetailView {...detail} />;
}
