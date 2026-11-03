import { Check, Circle, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {

  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  STEP_STATUS_LABELS,
  STEP_STATUSES,
  VALIDATION_STEP_META,
  WILLINGNESS,
  WILLINGNESS_LABELS,
  type StepStatus,
} from "@/lib/domain/product-validation";
import { formatMoney, formatPct } from "@/lib/domain/products";
import { cn } from "@/lib/utils";
import { createItemAction, deleteItemAction, setItemFieldAction, updateStepAction } from "../server/actions";
import type { loadProduct } from "../server/queries";

type Data = Awaited<ReturnType<typeof loadProduct>>;

const statusVariant: Record<StepStatus, "outline" | "secondary" | "success" | "destructive"> = {
  not_started: "outline",
  in_progress: "secondary",
  validated: "success",
  invalidated: "destructive",
};

export function ValidationTab({ data }: { data: Data }) {
  const v = data.validation;
  const d = v.demand;
  const pid = data.product.id;
  const cur = data.product.currency;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Validated demand: level {d.level} of 5, {d.levelLabel}
          </CardTitle>
          <CardDescription>Measured from what customers said and did (interviews, commitments, payments, retention), not from time spent building.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="grid gap-2 sm:grid-cols-5">
            {d.criteria.map((c) => (
              <li key={c.level} className={cn("flex flex-col gap-1 rounded-lg border p-3 text-xs", c.level <= d.level ? "border-success/50 bg-success/10" : "")}>
                <span className="flex items-center gap-1 text-sm font-medium">
                  {c.level <= d.level ? <Check className="size-4 text-success" aria-hidden /> : <Circle className="size-3.5 text-muted-foreground" aria-hidden />}
                  {c.level}. {c.label}
                  <span className="sr-only">{c.level <= d.level ? "(reached)" : c.met ? "(met, earlier level missing)" : "(not yet)"}</span>
                </span>
                <span className="text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ol>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
            {[
              ["Interviews", String(d.interviews)],
              ["Confirm the problem", formatPct(d.confirmRate)],
              ["Committed or paid", String(d.committed)],
              ["Said yes, no commitment", String(d.verbalYes)],
              ["Median stated price", d.medianStatedPrice == null ? "—" : formatMoney(d.medianStatedPrice, cur)],
              ["Landing conversion", d.landing.conversion == null ? "—" : `${formatPct(d.landing.conversion)} (${d.landing.signups}/${d.landing.visitors})`],
              ["Pre-sales", `${d.presales.count} · ${formatMoney(d.presales.amount, cur)}`],
              ["Steps validated", `${d.validatedSteps} of 12`],
              ["Steps invalidated", String(d.invalidatedSteps)],
              ["Follow-ups due", String(v.followUpsDue)],
            ].map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium tabular-nums">{val}</dd>
              </div>
            ))}
          </dl>
          {d.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
            </p>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <section aria-labelledby="steps-h" className="flex flex-col gap-2 lg:col-span-2">
          <h2 id="steps-h" className="text-lg font-semibold">
            Validation path
          </h2>
          <ol className="flex flex-col gap-2">
            {v.steps.map((s, i) => (
              <li key={s.step}>
                <details className="rounded-xl border bg-card" open={s.step === d.nextStep}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
                    <span className="text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{VALIDATION_STEP_META[s.step].label}</span>
                    <Badge variant={statusVariant[s.status]}>{STEP_STATUS_LABELS[s.status]}</Badge>
                    {s.decidedOn ? <span className="text-xs text-muted-foreground">{s.decidedOn}</span> : null}
                    <span className="ml-auto text-xs text-muted-foreground">{s.evidence.length} evidence</span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t p-3">
                    <ActionForm action={updateStepAction.bind(null, pid, s.step)} submitLabel="Save step" submitVariant="outline" resetOnSuccess={false}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Success criteria (what would prove it)" htmlFor={`sc-${s.step}`} className="sm:col-span-2">
                          <Textarea id={`sc-${s.step}`} name="successCriteria" rows={2} defaultValue={s.successCriteria} />
                        </Field>
                        <Field label="Status" htmlFor={`st-${s.step}`} hint="Validated or invalidated needs evidence.">
                          <Select id={`st-${s.step}`} name="status" defaultValue={s.status} key={s.status}>
                            {STEP_STATUSES.map((x) => (
                              <option key={x} value={x}>
                                {STEP_STATUS_LABELS[x]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label="Notes" htmlFor={`sn-${s.step}`}>
                        <Textarea id={`sn-${s.step}`} name="notes" rows={1} defaultValue={s.notes ?? ""} />
                      </Field>
                    </ActionForm>
                    {s.evidence.length ? (
                      <ul className="flex flex-col gap-1 text-sm">
                        {s.evidence.map((e) => (
                          <li key={e.id} className="flex items-start gap-2 border-t pt-2">
                            <div className="min-w-0 flex-1">
                              <p>
                                <span className="text-xs text-muted-foreground">
                                  {e.observedOn} · {EVIDENCE_KIND_LABELS[e.kind]}
                                  {e.value != null ? ` · ${e.kind === "payment" ? formatMoney(e.value, cur) : e.value}` : ""}
                                </span>
                              </p>
                              <p className="whitespace-pre-wrap">{e.summary}</p>
                              {e.url ? (
                                <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-xs underline-offset-2 hover:underline">
                                  Open link
                                </a>
                              ) : null}
                            </div>
                            <form action={deleteItemAction.bind(null, pid, "evidence", e.id)}>
                              <SubmitButton variant="ghost" size="sm" className="h-8 text-xs">
                                Remove
                              </SubmitButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ActionForm action={createItemAction.bind(null, pid, "evidence")} submitLabel="Add evidence" submitVariant="outline">
                      <input type="hidden" name="step" value={s.step} />
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Kind" htmlFor={`ek-${s.step}`}>
                          <Select id={`ek-${s.step}`} name="kind" defaultValue={s.step === "presales" ? "payment" : s.step === "landing_page" ? "signups" : "observation"}>
                            {EVIDENCE_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {EVIDENCE_KIND_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Number" htmlFor={`ev-${s.step}`} hint="For counts, metrics, payments">
                          <Input id={`ev-${s.step}`} name="value" type="number" step="0.01" inputMode="decimal" />
                        </Field>
                        <Field label="Date" htmlFor={`ed-${s.step}`}>
                          <Input id={`ed-${s.step}`} name="observedOn" type="date" max={data.today} defaultValue={data.today} />
                        </Field>
                        <Field label="Link" htmlFor={`eu-${s.step}`}>
                          <Input id={`eu-${s.step}`} name="url" type="url" placeholder="https://" />
                        </Field>
                      </div>
                      <Field label="What you observed" htmlFor={`es-${s.step}`}>
                        <Textarea id={`es-${s.step}`} name="summary" rows={2} required />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitors and alternatives</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {v.competitors.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                            {c.name}
                          </a>
                        ) : (
                          c.name
                        )}
                        {c.pricing ? <span className="font-normal text-muted-foreground"> · {c.pricing}</span> : null}
                      </p>
                      {c.strengths ? <p className="text-xs">+ {c.strengths}</p> : null}
                      {c.weaknesses ? <p className="text-xs">− {c.weaknesses}</p> : null}
                      {c.whyCustomersWouldSwitch ? <p className="text-xs text-muted-foreground">Switch because: {c.whyCustomersWouldSwitch}</p> : null}
                    </div>
                    <form action={deleteItemAction.bind(null, pid, "competitors", c.id)}>
                      <SubmitButton variant="ghost" size="sm" className="h-8 text-xs">
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add a competitor</summary>
                <ActionForm action={createItemAction.bind(null, pid, "competitors")} submitLabel="Add" submitVariant="outline" className="mt-3">
                  <Field label="Name" htmlFor="c-name" hint="Include spreadsheets and doing nothing">
                    <Input id="c-name" name="name" required maxLength={200} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Pricing" htmlFor="c-pricing">
                      <Input id="c-pricing" name="pricing" />
                    </Field>
                    <Field label="Link" htmlFor="c-url">
                      <Input id="c-url" name="url" type="url" placeholder="https://" />
                    </Field>
                  </div>
                  <Field label="Strengths" htmlFor="c-str">
                    <Input id="c-str" name="strengths" />
                  </Field>
                  <Field label="Weaknesses" htmlFor="c-weak">
                    <Input id="c-weak" name="weaknesses" />
                  </Field>
                  <Field label="Why customers would switch to you" htmlFor="c-why">
                    <Input id="c-why" name="whyCustomersWouldSwitch" />
                  </Field>
                </ActionForm>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>

      <InterviewLog data={data} />
    </div>
  );
}

function InterviewLog({ data }: { data: Data }) {
  const pid = data.product.id;
  const cur = data.product.currency;
  const interviews = data.validation.interviews;
  return (
    <section aria-labelledby="interviews-h" className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="flex flex-col gap-3 lg:col-span-2">
        <h2 id="interviews-h" className="text-lg font-semibold">
          Customer interviews · {interviews.length}
        </h2>
        {interviews.length === 0 ? <p className="text-sm text-muted-foreground">No interviews yet. Ten conversations beat a month of coding.</p> : null}
        <ul className="flex flex-col gap-2">
          {interviews.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.customerName ?? i.customerType}</span>
                {i.customerName ? <span className="text-xs text-muted-foreground">{i.customerType}</span> : null}
                <span className="text-xs text-muted-foreground">{i.interviewedOn}</span>
                <Badge variant={i.willingness === "paid" || i.willingness === "committed" ? "success" : i.willingness === "none" ? "destructive" : "outline"}>
                  {WILLINGNESS_LABELS[i.willingness]}
                  {i.statedPrice != null ? ` · ${formatMoney(i.statedPrice, cur)}` : ""}
                </Badge>
                {i.confirmsProblem != null ? <Badge variant="outline">{i.confirmsProblem ? "Confirms problem" : "Doesn't have the problem"}</Badge> : null}
                {i.painLevel ? <span className="text-xs text-muted-foreground">pain {i.painLevel}/5</span> : null}
                <form action={deleteItemAction.bind(null, pid, "interviews", i.id)} className="ml-auto">
                  <SubmitButton variant="ghost" size="sm" className="h-8 text-xs">
                    Remove
                  </SubmitButton>
                </form>
              </div>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {[
                  ["Problem", i.problem],
                  ["Current solution", i.currentSolution],
                  ["Objections", i.objections],
                  ["Feedback", i.feedback],
                ]
                  .filter(([, val]) => val)
                  .map(([k, val]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap">{val}</dd>
                    </div>
                  ))}
              </dl>
              {i.followUpOn && !i.followUpDone ? (
                <div className="flex items-center gap-2">
                  <Badge variant={i.followUpDue ? "warning" : "outline"}>
                    {i.followUpDue ? "Follow-up due" : "Follow up"} {i.followUpOn}
                  </Badge>
                  <form action={setItemFieldAction.bind(null, pid, "interviews", i.id)}>
                    <input type="hidden" name="followUpDone" value="true" />
                    <SubmitButton variant="outline" size="sm" className="h-8 text-xs">
                      Followed up
                    </SubmitButton>
                  </form>
                </div>
              ) : i.followUpDone ? (
                <span className="text-xs text-muted-foreground">Followed up</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log an interview</CardTitle>
          <CardDescription>Ask about the past, not hypotheticals. Only a commitment counts as willingness to pay.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createItemAction.bind(null, pid, "interviews")} submitLabel="Save interview">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer type" htmlFor="i-type" className="col-span-2">
                <Input id="i-type" name="customerType" required maxLength={200} placeholder="e.g. Agency owner, 12 staff" />
              </Field>
              <Field label="Name / company" htmlFor="i-name">
                <Input id="i-name" name="customerName" maxLength={200} />
              </Field>
              <Field label="Date" htmlFor="i-date">
                <Input id="i-date" name="interviewedOn" type="date" max={data.today} defaultValue={data.today} />
              </Field>
            </div>
            <Field label="Problem (in their words)" htmlFor="i-problem">
              <Textarea id="i-problem" name="problem" rows={2} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Confirms the problem?" htmlFor="i-confirms">
                <Select id="i-confirms" name="confirmsProblem" defaultValue="">
                  <option value="">Not asked</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Field label="Pain 1–5" htmlFor="i-pain">
                <Input id="i-pain" name="painLevel" type="number" min="1" max="5" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Current solution" htmlFor="i-current">
              <Textarea id="i-current" name="currentSolution" rows={2} placeholder="What do they do today? What does it cost them?" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Willingness to pay" htmlFor="i-wtp" className="col-span-2">
                <Select id="i-wtp" name="willingness" defaultValue="unclear">
                  {WILLINGNESS.map((w) => (
                    <option key={w} value={w}>
                      {WILLINGNESS_LABELS[w]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`Price they mentioned (${cur})`} htmlFor="i-price">
                <Input id="i-price" name="statedPrice" type="number" step="0.01" min="0" inputMode="decimal" />
              </Field>
              <Field label="Follow up on" htmlFor="i-follow">
                <Input id="i-follow" name="followUpOn" type="date" />
              </Field>
            </div>
            <Field label="Objections" htmlFor="i-obj">
              <Textarea id="i-obj" name="objections" rows={2} />
            </Field>
            <Field label="Feedback" htmlFor="i-fb">
              <Textarea id="i-fb" name="feedback" rows={2} />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </section>
  );
}

