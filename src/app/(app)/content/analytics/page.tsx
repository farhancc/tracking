import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsView } from "@/features/content/components/analytics-view";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Content analytics" };

export default function ContentAnalyticsPage({ searchParams }: PageProps<"/content/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <AnalyticsView searchParams={searchParams} />
    </Suspense>
  );
}
