import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalDetailPage } from "@/features/goals/components/goal-detail-page";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Goal" };

export default function Page({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <GoalDetailPage params={params} />
    </Suspense>
  );
}
