import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { QuarterView } from "@/features/roadmap/components/quarter-view";

export const metadata: Metadata = { title: "Quarter plan" };

export default function QuarterPage({ params }: PageProps<"/roadmap/q/[quarter]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <QuarterView params={params} />
    </Suspense>
  );
}
