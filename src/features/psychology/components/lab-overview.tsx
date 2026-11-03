import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import {
  EVIDENCE_LEVEL_LABELS,
  EVIDENCE_LEVELS,
  PSYCH_CATEGORIES,
  PSYCH_CATEGORY_LABELS,
  UNDERSTANDING_LABELS,
  type EvidenceLevel,
  type PsychCategory,
  type Understanding,
} from "@/lib/domain/psychology";
import { cn } from "@/lib/utils";
import { createConceptAction } from "../server/actions";
import { loadLab } from "../server/queries";
import { ConceptForm } from "./concept-form";
import { EvidenceBadge } from "./evidence-badge";

type Params = Record<string, string | string[] | undefined>;
const pick = (p: Params, k: string, allowed: readonly string[]) => (typeof p[k] === "string" && allowed.includes(p[k] as string) ? (p[k] as string) : undefined);

export async function LabOverview({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const category = pick(p, "category", PSYCH_CATEGORIES);
  const evidence = pick(p, "evidence", EVIDENCE_LEVELS);
  const q = typeof p.q === "string" ? p.q.slice(0, 100) : undefined;
  const data = await loadLab({ category, evidence, q });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const s = data.stats;
  const link = (next: { category?: string; evidence?: string }) => {
    const u = new URLSearchParams();
    if (next.category) u.set("category", next.category);
    if (next.evidence) u.set("evidence", next.evidence);
    const str = u.toString();
    return str ? `/psychology?${str}` : "/psychology";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales psychology lab</h1>
          <p className="text-sm text-muted-foreground">Concepts, evidence, spaced review and real-world experiments.</p>
        </div>
        <Link href="/psychology/review" className={buttonVariants({ variant: s.dueToday ? "default" : "outline" })}>
          {s.dueToday ? `Review ${s.dueToday} due` : "Nothing due"}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Concepts learned", s.learned, `${s.learnedLast30} in 30 days`],
          ["Reviewed", s.reviewedConcepts, `${s.reviewsLast30} reviews in 30 days`],
          ["Applied", s.appliedConcepts, `${s.applications} experiments`],
          ["Understood deeply", s.understoodDeeply, "earned by recall + use"],
          ["Needs further study", s.needsStudy, "forgotten or flagged"],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="rounded-xl border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
            <dd className="text-[11px] text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Evidence mix: {s.evidenceBased} evidence-based of {s.learned}
        {s.byEvidence.speculative ? ` · ${s.byEvidence.speculative} speculative (treat as hypotheses)` : ""}.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <nav aria-label="Filter" className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Link href={link({ evidence })} className={cn("rounded-full border px-3 py-1 text-xs", !category ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                All categories
              </Link>
              {PSYCH_CATEGORIES.map((c) => (
                <Link key={c} href={link({ category: c, evidence })} className={cn("rounded-full border px-3 py-1 text-xs", category === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                  {PSYCH_CATEGORY_LABELS[c]}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link href={link({ category })} className={cn("rounded-full border px-3 py-1 text-xs", !evidence ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                Any evidence
              </Link>
              {EVIDENCE_LEVELS.map((e) => (
                <Link key={e} href={link({ category, evidence: e })} className={cn("rounded-full border px-3 py-1 text-xs", evidence === e ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                  {EVIDENCE_LEVEL_LABELS[e].label}
                </Link>
              ))}
            </div>
          </nav>
          <form action="/psychology" className="flex gap-2">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            {evidence ? <input type="hidden" name="evidence" value={evidence} /> : null}
            <Input name="q" defaultValue={q ?? ""} placeholder="Search concepts…" aria-label="Search concepts" />
          </form>
          {data.concepts.length === 0 ? <p className="text-sm text-muted-foreground">No concepts yet. Add the first one.</p> : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/psychology/${c.id}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 hover:bg-accent">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{PSYCH_CATEGORY_LABELS[c.category as PsychCategory]}</span>
                  <span className="font-medium">{c.concept}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{c.explanation}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <EvidenceBadge level={c.evidenceLevel as EvidenceLevel} />
                    <Badge variant={c.understanding === "deep" ? "success" : c.understanding === "needs_study" ? "warning" : "outline"}>
                      {UNDERSTANDING_LABELS[c.understanding as Understanding]}
                    </Badge>
                    {c.srDueOn <= data.today ? <Badge variant="default">Review due</Badge> : <span className="text-xs text-muted-foreground">next review {c.srDueOn}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a concept</CardTitle>
            </CardHeader>
            <CardContent>
              <ConceptForm action={createConceptAction} submitLabel="Add concept" today={data.today} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
