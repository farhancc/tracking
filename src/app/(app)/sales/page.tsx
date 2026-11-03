import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { SalesDashboard } from "@/features/sales/components/sales-dashboard";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage({ searchParams }: PageProps<"/sales">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <SalesDashboard searchParams={searchParams} />
    </Suspense>
  );
}
