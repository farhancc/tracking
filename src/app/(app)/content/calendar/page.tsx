import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentCalendar } from "@/features/content/components/content-calendar";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Content calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/content/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ContentCalendar searchParams={searchParams} />
    </Suspense>
  );
}
