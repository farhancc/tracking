import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MonthlyAssessment } from "@/features/communication/components/monthly-assessment";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Monthly assessment" };

export default function AssessPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/communication" className="text-sm text-muted-foreground hover:text-foreground">
          ← Communication
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly communication assessment</h1>
      </div>
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <MonthlyAssessment />
      </Suspense>
    </div>
  );
}
