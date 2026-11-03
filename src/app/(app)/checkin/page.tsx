import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { CheckinView } from "@/features/today/components/checkin-view";

export const metadata: Metadata = { title: "Check-in" };

export default function CheckinPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <CheckinView />
    </Suspense>
  );
}
