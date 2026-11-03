import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EVIDENCE_LEVEL_LABELS, PSYCH_CATEGORY_LABELS, REVIEW_RATING_LABELS, REVIEW_RATINGS, type EvidenceLevel, type PsychCategory } from "@/lib/domain/psychology";
import { reviewAction } from "../server/actions";
import { loadReview } from "../server/queries";
import { EvidenceBadge } from "./evidence-badge";

export async function ReviewSession() {
  const { queue } = await loadReview();
  const card = queue[0];
  if (!card) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>All caught up</CardTitle>
          <CardDescription>No concepts are due for review today.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/psychology" className={buttonVariants({ variant: "outline" })}>
            Back to the lab
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">{queue.length} due · recall first, then reveal</p>
      <Card>
        <CardHeader>
          <CardDescription>{PSYCH_CATEGORY_LABELS[card.category as PsychCategory]}</CardDescription>
          <CardTitle className="text-2xl">{card.concept}</CardTitle>
          <CardDescription>What is it, why does it work, and where would you use it ethically?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">Show answer</summary>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <p>{card.explanation}</p>
              {card.takeaways ? (
                <p>
                  <span className="font-medium">Takeaways: </span>
                  {card.takeaways}
                </p>
              ) : null}
              {card.whereToApply ? (
                <p>
                  <span className="font-medium">Apply: </span>
                  {card.whereToApply}
                </p>
              ) : null}
              {card.ethics ? (
                <p>
                  <span className="font-medium">Ethics: </span>
                  {card.ethics}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <EvidenceBadge level={card.evidenceLevel as EvidenceLevel} />
                {!EVIDENCE_LEVEL_LABELS[card.evidenceLevel as EvidenceLevel].evidenceBased ? (
                  <span className="text-xs text-muted-foreground">Not established science. Test it before relying on it.</span>
                ) : null}
              </div>
            </div>
          </details>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REVIEW_RATINGS.map((r) => (
              <form key={r} action={reviewAction.bind(null, card.id, r)}>
                <SubmitButton variant={r === "good" ? "default" : "outline"} className="h-12 w-full text-xs" pendingText="…">
                  {REVIEW_RATING_LABELS[r]}
                </SubmitButton>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
