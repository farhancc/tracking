import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemDetail } from "@/features/content/components/item-detail";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Content item" };

export default function ContentItemPage({ params }: PageProps<"/content/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ItemDetail params={params} />
    </Suspense>
  );
}
