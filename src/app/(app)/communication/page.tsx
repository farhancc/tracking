import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunicationOverview } from "@/features/communication/components/communication-overview";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Communication" };

export default function CommunicationPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <CommunicationOverview />
    </Suspense>
  );
}
