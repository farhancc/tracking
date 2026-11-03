import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ProductDetail } from "@/features/products/components/product-detail";

export const metadata: Metadata = { title: "Product" };

export default function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ProductDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
