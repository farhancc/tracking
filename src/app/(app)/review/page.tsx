import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ReviewView } from "@/features/review/components/review-view";

export const metadata: Metadata = { title: "Weekly review" };

export default function ReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <ReviewView />
    </Suspense>
  );
}
