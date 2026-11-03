import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { TodayView } from "@/features/today/components/today-view";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <TodayView />
    </Suspense>
  );
}
