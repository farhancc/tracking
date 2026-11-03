import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { WeekView } from "@/features/weekly/components/week-view";
import { isIsoDate } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Week" };

async function Week({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;
  if (!isIsoDate(weekStart)) notFound();
  return <WeekView weekStart={weekStart} />;
}

export default function WeekPage({ params }: PageProps<"/week/[weekStart]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <Week params={params} />
    </Suspense>
  );
}
