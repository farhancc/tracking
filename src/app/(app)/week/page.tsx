import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { WeekView } from "@/features/weekly/components/week-view";

export const metadata: Metadata = { title: "This week" };

export default function ThisWeekPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <WeekView />
    </Suspense>
  );
}
