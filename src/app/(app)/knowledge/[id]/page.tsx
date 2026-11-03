import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ResourceDetail } from "@/features/knowledge/components/resource-detail";

export const metadata: Metadata = { title: "Resource" };

export default function ResourcePage({ params }: PageProps<"/knowledge/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ResourceDetail params={params} />
    </Suspense>
  );
}
