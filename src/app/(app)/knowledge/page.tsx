import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { KnowledgeLibrary } from "@/features/knowledge/components/knowledge-library";

export const metadata: Metadata = { title: "Knowledge" };

export default function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <KnowledgeLibrary searchParams={searchParams} />
    </Suspense>
  );
}
