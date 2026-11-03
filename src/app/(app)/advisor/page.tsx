import type { Metadata } from "next";
import { Suspense } from "react";
import { AdvisorView } from "@/features/advisor/components/advisor-view";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Advisor" };

export default function AdvisorPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <AdvisorView />
    </Suspense>
  );
}
