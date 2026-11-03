import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  APPLICATION_OUTCOME_LABELS,
  APPLICATION_OUTCOMES,
  EVIDENCE_LEVEL_LABELS,
  PSYCH_CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
  UNDERSTANDING_LABELS,
  UNDERSTANDING_LEVELS,
  type ApplicationOutcome,
  type EvidenceLevel,
  type PsychCategory,
  type SourceType,
  type Understanding,
} from "@/lib/domain/psychology";
import { addApplicationAction, archiveConceptAction, deleteApplicationAction, setUnderstandingAction, updateConceptAction } from "../server/actions";
import { loadConcept } from "../server/queries";
import { ConceptForm } from "./concept-form";
import { EvidenceBadge } from "./evidence-badge";

export async function ConceptDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadConcept(id).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const { concept: c, reviews, applications, deepCheck, needsStudy, today } = data;
  const level = c.evidenceLevel as EvidenceLevel;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/psychology" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Psychology lab
      </Link>
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{PSYCH_CATEGORY_LABELS[c.category as PsychCategory]}</span>
        <h1 className="text-2xl font-semibold tracking-tight">{c.concept}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceBadge level={level} />
          <Badge variant={c.understanding === "deep" ? "success" : c.understanding === "needs_study" ? "warning" : "outline"}>
            {UNDERSTANDING_LABELS[c.understanding as Understanding]}
          </Badge>
          {needsStudy && c.understanding !== "needs_study" ? <Badge variant="warning">Needs further study</Badge> : null}
          <span className="text-xs text-muted-foreground">
            Next review {c.srDueOn} · {c.srRepetitions} successful in a row · {c.srLapses} lapses
          </span>
        </div>
        {!EVIDENCE_LEVEL_LABELS[level].evidenceBased ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            {EVIDENCE_LEVEL_LABELS[level].description} Log experiments below before relying on it.
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 text-sm">
              <p className="whitespace-pre-wrap">{c.explanation}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Source", c.sourceTitle || c.sourceAuthor ? `${[c.sourceTitle, c.sourceAuthor].filter(Boolean).join(" · ")} (${SOURCE_TYPE_LABELS[c.sourceType as SourceType]})` : null],
                  ["Evidence notes", c.evidenceNotes],
                  ["Practical example", c.example],
                  ["Ethical considerations", c.ethics],
                  ["Where I can apply it", c.whereToApply],
                  ["My observations", c.observations],
                  ["Key takeaways", c.takeaways],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
              </dl>
              {c.sourceUrl ? (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline-offset-2 hover:underline">
                  Open source
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Experiments and results</CardTitle>
              <CardDescription>Where you applied it and what actually happened.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {applications.map((a) => (
                <div key={a.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.outcome === "worked" ? "success" : a.outcome === "did_not_work" ? "destructive" : "outline"}>
                      {APPLICATION_OUTCOME_LABELS[a.outcome as ApplicationOutcome]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{a.appliedOn}</span>
                    <form className="ml-auto" action={deleteApplicationAction.bind(null, a.id)}>
                      <SubmitButton variant="ghost" size="icon" className="size-8" aria-label="Delete experiment">
                        <Trash2 className="size-4" aria-hidden />
                      </SubmitButton>
                    </form>
                  </div>
                  <p className="font-medium">{a.context}</p>
                  {a.action ? <p>Tried: {a.action}</p> : null}
                  {a.result ? <p>Result: {a.result}</p> : null}
                </div>
              ))}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Log an experiment</summary>
                <ActionForm action={addApplicationAction.bind(null, c.id)} submitLabel="Log experiment" submitVariant="outline" className="mt-3">
                  <Field label="Where / with whom" htmlFor="x-context">
                    <Input id="x-context" name="context" required maxLength={1000} placeholder="e.g. Discovery call with Northwind" />
                  </Field>
                  <Field label="What I tried" htmlFor="x-action">
                    <Textarea id="x-action" name="action" rows={2} />
                  </Field>
                  <Field label="What happened" htmlFor="x-result">
                    <Textarea id="x-result" name="result" rows={2} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Outcome" htmlFor="x-outcome">
                      <Select id="x-outcome" name="outcome" defaultValue="inconclusive">
                        {APPLICATION_OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {APPLICATION_OUTCOME_LABELS[o]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Date" htmlFor="x-date">
                      <Input id="x-date" name="appliedOn" type="date" max={today} defaultValue={today} />
                    </Field>
                  </div>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer font-semibold">Edit concept</summary>
            <div className="mt-3">
              <ConceptForm action={updateConceptAction.bind(null, c.id)} initial={c} submitLabel="Save changes" today={today} />
            </div>
          </details>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Understanding</CardTitle>
              <CardDescription>
                {deepCheck.allowed ? "You've recalled and applied it, so it can be marked understood deeply." : "“Understood deeply” is earned:"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!deepCheck.allowed ? (
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {deepCheck.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={setUnderstandingAction.bind(null, c.id)} submitLabel="Update" submitVariant="outline" inline resetOnSuccess={false} submitClassName="h-9">
                <Select name="understanding" defaultValue={c.understanding} key={c.understanding} aria-label="Understanding">
                  {UNDERSTANDING_LEVELS.map((u) => (
                    <option key={u} value={u}>
                      {UNDERSTANDING_LABELS[u]}
                    </option>
                  ))}
                </Select>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review history</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? <p className="text-sm text-muted-foreground">Not reviewed yet.</p> : null}
              <ul className="flex flex-col gap-1 text-sm">
                {reviews.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.reviewedOn}</span>
                    <span className="text-muted-foreground">
                      {r.rating} · {r.intervalBefore} → {r.intervalAfter} days
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <form action={archiveConceptAction.bind(null, c.id)}>
            <SubmitButton variant="ghost" size="sm">
              Archive concept
            </SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
