import type { Metadata } from "next";
import { Suspense } from "react";
import { FinanceDashboard } from "@/features/finance/components/finance-dashboard";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <FinanceDashboard />
    </Suspense>
  );
}
