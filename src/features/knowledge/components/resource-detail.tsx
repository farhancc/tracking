import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, PROGRESS_UNIT, RESOURCE_KIND_LABELS, RESOURCE_STATUS_LABELS, type ResourceKind, type ResourceStatus } from "@/lib/domain/knowledge";
import { PSYCH_CATEGORIES, PSYCH_CATEGORY_LABELS } from "@/lib/domain/psychology";
import {
  addApplicationAction,
  addConceptAction,
  archiveResourceAction,
  deleteApplicationAction,
  deleteConceptAction,
  journalFromApplicationAction,
  promoteConceptAction,
  updateApplicationAction,
  updateResourceAction,
} from "../server/actions";
import { loadResource } from "../server/queries";
import { ResourceForm } from "./resource-form";

export async function ResourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadResource(id).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const r = data.resource;
  const unit = PROGRESS_UNIT[r.kind as ResourceKind];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Knowledge
      </Link>
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {RESOURCE_KIND_LABELS[r.kind as ResourceKind]}
          {r.category ? ` · ${r.category}` : ""}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {r.author ? <span className="text-muted-foreground">{r.author}</span> : null}
          <Badge variant={r.status === "completed" ? "success" : r.status === "in_progress" ? "default" : "outline"}>{RESOURCE_STATUS_LABELS[r.status as ResourceStatus]}</Badge>
          {r.rating ? <span aria-label={`Rated ${r.rating} of 5`}>{"★".repeat(r.rating)}</span> : null}
          <span className="text-xs text-muted-foreground">
            {r.startedOn ? `started ${r.startedOn}` : ""}
            {r.completedOn ? ` · completed ${r.completedOn}` : ""}
            {data.minutesRead ? ` · ${data.minutesRead} min logged` : ""}
          </span>
        </div>
        {r.totalUnits && unit ? (
          <div className="flex max-w-md items-center gap-2 text-xs text-muted-foreground">
            <Progress value={((r.progressUnits ?? 0) / r.totalUnits) * 100} aria-label="Progress" />
            <span className="shrink-0 tabular-nums">
              {r.progressUnits ?? 0}/{r.totalUnits} {unit}
            </span>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Put it into practice</CardTitle>
              <CardDescription>Turn what you learned into a practice task, then record what happened in the sales journal.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.applications.length === 0 ? <p className="text-sm text-muted-foreground">No applications yet.</p> : null}
              {data.applications.map((a) => {
                const concept = data.concepts.find((c) => c.id === a.conceptId);
                return (
                  <div key={a.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.description}</p>
                        {concept ? <p className="text-xs text-muted-foreground">Concept: {concept.concept}</p> : null}
                      </div>
                      <Badge variant={a.status === "done" ? "success" : a.status === "practising" ? "default" : "outline"}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>
                      <form action={deleteApplicationAction.bind(null, a.id)}>
                        <SubmitButton variant="ghost" size="icon" className="size-8" aria-label="Delete application">
                          <Trash2 className="size-4" aria-hidden />
                        </SubmitButton>
                      </form>
                    </div>
                    <ul className="flex flex-col gap-1 text-xs">
                      {a.task ? (
                        <li>
                          Practice task:{" "}
                          <Link className="underline-offset-2 hover:underline" href={a.task.plannedWeek ? `/week/${a.task.plannedWeek}` : "/week"}>
                            {a.task.title}
                          </Link>{" "}
                          <span className="text-muted-foreground">({a.task.status.replace("_", " ")})</span>
                        </li>
                      ) : null}
                      {a.journal ? (
                        <li>
                          Sales journal:{" "}
                          <Link className="underline-offset-2 hover:underline" href="/sales/journal">
                            {a.journal.title}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            ({a.journal.occurredOn}
                            {a.journal.worked != null ? (a.journal.worked ? ", worked" : ", didn't work") : ""})
                          </span>
                        </li>
                      ) : null}
                      {a.appliedOn ? <li className="text-muted-foreground">Applied {a.appliedOn}</li> : null}
                    </ul>
                    <ActionForm action={updateApplicationAction.bind(null, a.id)} submitLabel="Save" submitVariant="outline" resetOnSuccess={false} className="gap-2">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Field label="Status" htmlFor={`as-${a.id}`}>
                          <Select id={`as-${a.id}`} name="status" defaultValue={a.status} key={a.status}>
                            {APPLICATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {APPLICATION_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="What happened" htmlFor={`ar-${a.id}`} className="sm:col-span-2">
                          <Input id={`ar-${a.id}`} name="result" defaultValue={a.result ?? ""} maxLength={10_000} />
                        </Field>
                      </div>
                    </ActionForm>
                    {!a.journal ? (
                      <details className="rounded-md border p-2">
                        <summary className="cursor-pointer text-xs font-medium">Write it into the sales journal</summary>
                        <ActionForm action={journalFromApplicationAction.bind(null, a.id)} submitLabel="Add to journal" submitVariant="outline" className="mt-2 gap-2">
                          <Field label="Title" htmlFor={`jt-${a.id}`}>
                            <Input id={`jt-${a.id}`} name="title" required maxLength={200} defaultValue={a.description.slice(0, 200)} />
                          </Field>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="What they said" htmlFor={`js-${a.id}`}>
                              <Textarea id={`js-${a.id}`} name="situation" rows={2} />
                            </Field>
                            <Field label="What I said or did" htmlFor={`jr-${a.id}`}>
                              <Textarea id={`jr-${a.id}`} name="response" rows={2} />
                            </Field>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Field label="Did it work?" htmlFor={`jw-${a.id}`}>
                              <Select id={`jw-${a.id}`} name="worked" defaultValue="">
                                <option value="">Not sure yet</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </Select>
                            </Field>
                            <Field label="Lesson" htmlFor={`jl-${a.id}`} className="sm:col-span-2">
                              <Input id={`jl-${a.id}`} name="lesson" maxLength={5000} />
                            </Field>
                          </div>
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                );
              })}
              <details className="rounded-lg border p-3" open={data.applications.length === 0}>
                <summary className="cursor-pointer text-sm font-medium">New application</summary>
                <ActionForm action={addApplicationAction.bind(null, r.id)} submitLabel="Add" className="mt-3">
                  <Field label="How will you apply it?" htmlFor="na-desc">
                    <Input id="na-desc" name="description" required maxLength={2000} placeholder="e.g. Label the buyer's concern before answering price objections" />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Concept" htmlFor="na-concept">
                      <Select id="na-concept" name="conceptId" defaultValue="">
                        <option value="">None</option>
                        {data.concepts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.concept}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Link an existing sales journal entry" htmlFor="na-journal">
                      <Select id="na-journal" name="journalEntryId" defaultValue="">
                        <option value="">None</option>
                        {data.recentJournal.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.occurredOn} · {j.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="createTask" defaultChecked /> Create a practice task in this week&rsquo;s plan
                  </label>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card p-4" open={!r.notes}>
            <summary className="cursor-pointer font-semibold">Details and notes</summary>
            <div className="mt-3">
              <ResourceForm action={updateResourceAction.bind(null, r.id)} initial={r} submitLabel="Save" today={data.today} goals={data.goals} />
            </div>
          </details>
          {r.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{r.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Important concepts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.concepts.map((c) => (
                <div key={c.id} className="flex flex-col gap-1 rounded-lg border p-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-medium">{c.concept}</span>
                    <ActionForm action={deleteConceptAction.bind(null, c.id)} submitLabel="Remove" submitVariant="outline" inline submitClassName="h-7 px-2 text-xs" pendingLabel="…">
                      {null}
                    </ActionForm>
                  </div>
                  {c.explanation ? <p className="text-xs text-muted-foreground">{c.explanation}</p> : null}
                  {c.psychConceptId ? (
                    <Link href={`/psychology/${c.psychConceptId}`} className="text-xs underline-offset-2 hover:underline">
                      In the psychology lab →
                    </Link>
                  ) : (
                    <ActionForm action={promoteConceptAction.bind(null, c.id)} submitLabel="Add to psychology lab" submitVariant="outline" inline submitClassName="h-8 text-xs">
                      <Select name="category" defaultValue="persuasion" aria-label={`Psychology category for ${c.concept}`} className="h-8 text-xs">
                        {PSYCH_CATEGORIES.map((k) => (
                          <option key={k} value={k}>
                            {PSYCH_CATEGORY_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                    </ActionForm>
                  )}
                </div>
              ))}
              <ActionForm action={addConceptAction.bind(null, r.id)} submitLabel="Add concept" submitVariant="outline">
                <Field label="Concept" htmlFor="nc-concept">
                  <Input id="nc-concept" name="concept" required maxLength={300} />
                </Field>
                <Field label="In your words" htmlFor="nc-expl">
                  <Textarea id="nc-expl" name="explanation" rows={2} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
          {data.sessions.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reading log</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm">
                  {data.sessions.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>{s.readOn}</span>
                      <span className="text-muted-foreground">
                        {s.minutes} min{s.units ? ` · ${s.units} ${unit ?? ""}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <form action={archiveResourceAction.bind(null, r.id)}>
            <SubmitButton variant="ghost" size="sm">
              Archive
            </SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
