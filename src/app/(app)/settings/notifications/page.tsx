import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { NotificationSettingsView } from "@/features/notifications/components/settings-view";

export const metadata: Metadata = { title: "Notification settings" };

export default function NotificationSettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NotificationSettingsView />
    </Suspense>
  );
}
