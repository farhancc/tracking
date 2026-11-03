import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { RoadmapOverview } from "@/features/roadmap/components/roadmap-overview";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Five-year roadmap</h1>
        <p className="text-sm text-muted-foreground">
          Five annual plans and twenty quarterly execution cycles. Directions are provisional, and every objective is yours to edit.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <RoadmapOverview />
      </Suspense>
    </div>
  );
}
