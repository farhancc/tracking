import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ConceptDetail } from "@/features/psychology/components/concept-detail";

export const metadata: Metadata = { title: "Concept" };

export default function ConceptPage({ params }: PageProps<"/psychology/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <ConceptDetail params={params} />
    </Suspense>
  );
}
