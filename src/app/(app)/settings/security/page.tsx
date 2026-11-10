import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { SecurityView } from "@/features/settings/components/security-view";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <SecurityView />
    </Suspense>
  );
}
