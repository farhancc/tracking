import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/features/goals/components/page-skeleton";
import { ReviewSession } from "@/features/psychology/components/review-session";

export const metadata: Metadata = { title: "Review" };

export default function ReviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/psychology" className="text-sm text-muted-foreground hover:text-foreground">
          ← Psychology lab
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Spaced review</h1>
      </div>
      <Suspense fallback={<PageSkeleton rows={2} />}>
        <ReviewSession />
      </Suspense>
    </div>
  );
}
