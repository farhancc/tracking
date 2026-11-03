import type { Metadata } from "next";
import { Suspense } from "react";
import { NewGoalPage } from "@/features/goals/components/goal-form-page";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "New goal" };

export default function Page({ searchParams }: PageProps<"/goals/new">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New goal</h1>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <NewGoalPage searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
