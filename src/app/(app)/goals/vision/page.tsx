import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { VisionWorkspace } from "@/features/goals/components/vision-workspace";

export const metadata: Metadata = { title: "Five-year vision" };

export default function VisionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Five-year vision</h1>
        <p className="text-sm text-muted-foreground">
          Your vision, professional identity and exit strategy, plus the measurable five-year goals behind them.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <VisionWorkspace />
      </Suspense>
    </div>
  );
}
