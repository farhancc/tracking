import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { SalesJournal } from "@/features/sales/components/sales-journal";

export const metadata: Metadata = { title: "Sales learning journal" };

export default function SalesJournalPage({ searchParams }: PageProps<"/sales/journal">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/sales" className="text-sm text-muted-foreground hover:text-foreground">
          ← Sales
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Sales learning journal</h1>
        <p className="text-sm text-muted-foreground">Difficult objections, responses that worked, rejections, wins, mistakes and lessons.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <SalesJournal searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
