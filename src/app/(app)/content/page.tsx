import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentPipeline } from "@/features/content/components/pipeline";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Content" };

export default function ContentPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ContentPipeline />
    </Suspense>
  );
}
