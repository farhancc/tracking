import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { PortfolioOverview } from "@/features/products/components/portfolio-overview";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <PortfolioOverview />
    </Suspense>
  );
}
