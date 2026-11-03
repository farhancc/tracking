import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillDetail } from "@/features/communication/components/skill-detail";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";

export const metadata: Metadata = { title: "Communication skill" };

export default function SkillPage({ params }: PageProps<"/communication/[skill]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <SkillDetail params={params} />
    </Suspense>
  );
}
