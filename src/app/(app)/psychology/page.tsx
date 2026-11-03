import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { LabOverview } from "@/features/psychology/components/lab-overview";

export const metadata: Metadata = { title: "Psychology lab" };

export default function PsychologyPage({ searchParams }: PageProps<"/psychology">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <LabOverview searchParams={searchParams} />
    </Suspense>
  );
}
