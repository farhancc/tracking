import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { HabitHistory } from "@/features/habits/components/habit-history";

export const metadata: Metadata = { title: "Habit" };

export default function HabitPage({ params }: PageProps<"/habits/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <HabitHistory params={params} />
    </Suspense>
  );
}
