import type { Metadata } from "next";
import { Suspense } from "react";
import { IdeaLibrary } from "@/features/content/components/idea-library";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Idea library" };

export default function IdeasPage({ searchParams }: PageProps<"/content/ideas">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <IdeaLibrary searchParams={searchParams} />
    </Suspense>
  );
}
