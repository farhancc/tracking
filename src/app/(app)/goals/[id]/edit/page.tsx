import type { Metadata } from "next";
import { Suspense } from "react";
import { EditGoalPage } from "@/features/goals/components/goal-form-page";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Edit goal" };

export default function Page({ params }: PageProps<"/goals/[id]/edit">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit goal</h1>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <EditGoalPage params={params} />
      </Suspense>
    </div>
  );
}
