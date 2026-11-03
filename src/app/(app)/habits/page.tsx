import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { HabitsView } from "@/features/habits/components/habits-view";

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <HabitsView />
    </Suspense>
  );
}
