import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { GoalsOverview } from "@/features/goals/components/goals-overview";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Strategic goals" };

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategic goals</h1>
          <p className="text-sm text-muted-foreground">
            Five-year vision → annual → quarterly → monthly → weekly → daily. Every goal is measured by its outcome.
          </p>
        </div>
        <Link href="/goals/new" className={buttonVariants()}>
          <Plus aria-hidden /> New goal
        </Link>
      </div>
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <GoalsOverview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
