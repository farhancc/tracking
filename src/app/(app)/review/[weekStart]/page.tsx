import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ReviewView } from "@/features/review/components/review-view";

export const metadata: Metadata = { title: "Weekly review" };

async function Week({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;
  return <ReviewView weekStart={weekStart} />;
}

export default function ReviewWeekPage({ params }: PageProps<"/review/[weekStart]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Week params={params} />
    </Suspense>
  );
}
