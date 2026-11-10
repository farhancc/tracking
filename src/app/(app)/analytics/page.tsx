import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <AnalyticsView searchParams={searchParams} />
    </Suspense>
  );
}
