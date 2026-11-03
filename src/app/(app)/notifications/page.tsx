import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { InboxView } from "@/features/notifications/components/inbox-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <InboxView />
    </Suspense>
  );
}
