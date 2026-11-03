import { ArrowLeft, CircleAlert, Info, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { HealthBadge, StatusBadge } from "@/features/goals/components/badges";
import { GoalProgress } from "@/features/goals/components/goal-progress";
import { KeyResultsPanel } from "@/features/goals/components/key-results-panel";
import { GOAL_LEVEL_LABELS, MEASURE_UNIT_LABELS, MEASURE_UNITS, formatMeasure, type GoalLevel, type GoalStatus, type MeasureUnit } from "@/lib/domain/goals";
import {
  DELIVERABLE_STATUSES,
  DELIVERABLE_STATUS_LABELS,
  RISK_STATUS_LABELS,
  kpiAttainment,
  type DeliverableStatus,
  type KpiDirection,
  type RiskStatus,
} from "@/lib/domain/roadmap";
import {
  addDeliverableAction,
  addKpiAction,
  addQuarterDependencyAction,
  addRiskAction,
  deleteDeliverableAction,
  deleteKpiAction,
  deleteQuarterDependencyAction,
  deleteRiskAction,
  saveQuarterReviewAction,
  setDeliverableStatusAction,
  setQuarterDependencyStatusAction,
  setRiskStatusAction,
  updateKpiActualAction,
  updateQuarterAction,
} from "../server/actions";
import { loadQuarter } from "../server/queries";

export async function QuarterView({ params }: { params: Promise<{ quarter: string }> }) {
  const { quarter: raw } = await params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) notFound();
  const data = await loadQuarter(n).catch((e: { status?: number; code?: string }) => {
    if (e?.status === 404 || e?.code === "journey_required") notFound();
    throw e;
  });
  const { quarter: q, year, objectives, deliverables, kpis, risks, dependencies, actual, assessment, history, annualObjectives, goalOptions, workspace } = data;

  const addObjectiveHref = `/goals/new?level=quarterly&mode=key_results&start=${q.startDate}&end=${q.endDate}${
    annualObjectives.length === 1 ? `&parentId=${annualObjectives[0].id}` : ""
  }`;
  const objectiveOptions = objectives.map((o) => ({ id: o.id, title: o.title }));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/roadmap" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Roadmap
        </Link>
        <span aria-hidden>/</span>
        <span>Year {q.yearNumber}</span>
        <span className="ml-auto flex gap-2">
          {q.quarterNumber > 1 ? (
            <Link href={`/roadmap/q/${q.quarterNumber - 1}`} className="hover:text-foreground">
              ← Previous
            </Link>
          ) : null}
          {q.quarterNumber < 20 ? (
            <Link href={`/roadmap/q/${q.quarterNumber + 1}`} className="hover:text-foreground">
              Next →
            </Link>
          ) : null}
        </span>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{q.label}</h1>
          <Badge variant={q.state === "current" ? "default" : "outline"}>
            {q.state === "current" ? "Current quarter" : q.state === "past" ? "Past" : "Upcoming"}
          </Badge>
          {q.reviewedAt ? <Badge variant="success">Reviewed</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {q.startDate} → {q.endDate} · Quarter {q.quarterNumber} of 20
          {q.state === "current" ? ` · ${q.expectedPct}% elapsed` : ""}
        </p>
        {year ? (
          <p className="text-sm">
            <span className="font-medium">Year {year.yearNumber} · {year.theme}:</span> {year.direction}
            {year.isProvisional ? <span className="text-muted-foreground"> (provisional)</span> : null}
          </p>
        ) : null}
        {q.focus ? <p className="text-sm"><span className="font-medium">Quarter focus:</span> {q.focus}</p> : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Plan check</CardTitle>
              <CardDescription>
                {assessment.capacityHours !== null
                  ? `${assessment.plannedHours} h planned against ${assessment.capacityHours} h available (${q.capacityHoursPerWeek} h/week).`
                  : "Set your available hours per week to check this plan."}
                {history && assessment.deliveryRate !== null
                  ? ` Track record: ${history.deliverablesDelivered} of ${history.deliverablesPlanned} deliverables delivered over ${history.quarters} quarter${history.quarters === 1 ? "" : "s"} (${assessment.deliveryRate}%).`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {assessment.loadPct !== null ? (
                <Progress
                  value={Math.min(assessment.loadPct, 100)}
                  tone={assessment.loadPct > 100 ? "destructive" : assessment.loadPct > 85 ? "warning" : "success"}
                  label="Planned effort as a share of available time"
                />
              ) : null}
              {assessment.warnings.length === 0 ? (
                <p className="text-sm text-success">The plan fits your available time and track record.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {assessment.warnings.map((w) => (
                    <li key={w.code} className="flex items-start gap-2 text-sm">
                      {w.level === "warning" ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
                      ) : (
                        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Note" />
                      )}
                      <span>{w.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Objectives and key results</CardTitle>
                  <CardDescription>
                    Three to five major objectives. Each is measured only by its key results.
                    {actual.objectiveCompletion !== null ? ` Overall ${actual.objectiveCompletion}% complete.` : ""}
                  </CardDescription>
                </div>
                <Link href={addObjectiveHref} className={buttonVariants({ size: "sm" })}>
                  <Plus aria-hidden /> Objective
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No objectives yet.
                  {annualObjectives.length === 0 ? " Create an annual objective for this year first, so quarterly objectives can roll up to it." : ""}
                </p>
              ) : null}
              {objectives.map((o) => (
                <section key={o.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/goals/${o.id}`} className="font-medium hover:underline">
                      {o.title}
                    </Link>
                    <StatusBadge status={o.status as GoalStatus} />
                    <HealthBadge health={o.health} />
                    {o.estimatedHours ? <span className="text-xs text-muted-foreground">{o.estimatedHours} h est.</span> : null}
                  </div>
                  <GoalProgress goal={o} compact />
                  {o.measurementMode === "key_results" ? (
                    <KeyResultsPanel objective={o} keyResults={o.keyResults} baseCurrency={workspace.baseCurrency} compact />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Measured directly by &ldquo;{o.successMetric}&rdquo;. Switch it to &ldquo;from key results&rdquo; on the goal page to use OKRs.
                    </p>
                  )}
                </section>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deliverables</CardTitle>
              <CardDescription>
                Concrete outputs you will ship. {actual.deliverablesPlanned > 0 ? `${actual.deliverablesDelivered} of ${actual.deliverablesPlanned} delivered.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {deliverables.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {deliverables.map((d) => (
                    <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <p className={d.status === "dropped" ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[d.goalTitle, d.dueOn ? `due ${d.dueOn}` : null, d.estimatedHours ? `${d.estimatedHours} h` : null, d.deliveredOn ? `delivered ${d.deliveredOn}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {d.evidence ? <p className="truncate text-xs">Evidence: {d.evidence}</p> : null}
                      </div>
                      <ActionForm
                        action={setDeliverableStatusAction.bind(null, d.id)}
                        submitLabel="Update"
                        submitVariant="outline"
                        resetOnSuccess={false}
                        className="flex-row flex-wrap items-end gap-2"
                        submitClassName="h-8"
                      >
                        <Select name="status" defaultValue={d.status} aria-label={`Status of ${d.title}`} className="h-8 w-36" key={d.status}>
                          {DELIVERABLE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {DELIVERABLE_STATUS_LABELS[s as DeliverableStatus]}
                            </option>
                          ))}
                        </Select>
                        <Input name="evidence" defaultValue={d.evidence ?? ""} placeholder="Evidence (link)" aria-label="Evidence" className="h-8 w-40" />
                      </ActionForm>
                      <form action={deleteDeliverableAction.bind(null, d.id)}>
                        <SubmitButton variant="ghost" size="icon" aria-label={`Delete ${d.title}`}>
                          <Trash2 aria-hidden />
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add deliverable</summary>
                <ActionForm action={addDeliverableAction.bind(null, q.quarterNumber)} submitLabel="Add deliverable" submitVariant="outline" className="mt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Deliverable" htmlFor="d-title" className="sm:col-span-2">
                      <Input id="d-title" name="title" required maxLength={300} placeholder="e.g. Landing page with waitlist live" />
                    </Field>
                    <Field label="For objective (optional)" htmlFor="d-goal">
                      <Select id="d-goal" name="goalId" defaultValue="">
                        <option value="">None</option>
                        {objectiveOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Due" htmlFor="d-due">
                      <Input id="d-due" name="dueOn" type="date" min={q.startDate} max={q.endDate} />
                    </Field>
                    <Field label="Estimated hours" htmlFor="d-hours">
                      <Input id="d-hours" name="estimatedHours" type="number" min={0} step="0.5" />
                    </Field>
                  </div>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>KPIs</CardTitle>
              <CardDescription>
                Health metrics to watch this quarter (e.g. dials per week, conversion rate).
                {actual.kpiAttainment !== null ? ` Average attainment ${actual.kpiAttainment}%.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {kpis.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {kpis.map((k) => {
                    const unit = k.unit as MeasureUnit;
                    const score = kpiAttainment({ direction: k.direction as KpiDirection, targetValue: k.targetValue, actualValue: k.actualValue });
                    return (
                      <li key={k.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{k.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Target {k.direction === "down" ? "≤" : "≥"} {formatMeasure(k.targetValue, unit, k.currency)}
                            {k.actualValue !== null ? ` · actual ${formatMeasure(k.actualValue, unit, k.currency)}` : " · no actual yet"}
                            {score !== null ? ` · ${score}%` : ""}
                          </p>
                        </div>
                        <ActionForm
                          action={updateKpiActualAction.bind(null, k.id)}
                          submitLabel="Save"
                          submitVariant="outline"
                          resetOnSuccess={false}
                          className="flex-row items-end gap-2"
                          submitClassName="h-8"
                        >
                          <Input name="actualValue" type="number" step="any" defaultValue={k.actualValue ?? ""} aria-label={`Actual for ${k.name}`} className="h-8 w-28" />
                        </ActionForm>
                        <form action={deleteKpiAction.bind(null, k.id)}>
                          <SubmitButton variant="ghost" size="icon" aria-label={`Delete ${k.name}`}>
                            <Trash2 aria-hidden />
                          </SubmitButton>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add KPI</summary>
                <ActionForm action={addKpiAction.bind(null, q.quarterNumber)} submitLabel="Add KPI" submitVariant="outline" className="mt-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="KPI" htmlFor="k-name" className="sm:col-span-3">
                      <Input id="k-name" name="name" required maxLength={200} placeholder="e.g. Cold calls per week" />
                    </Field>
                    <Field label="Unit" htmlFor="k-unit">
                      <Select id="k-unit" name="unit" defaultValue="number">
                        {MEASURE_UNITS.filter((u) => u !== "boolean").map((u) => (
                          <option key={u} value={u}>
                            {MEASURE_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Good when" htmlFor="k-dir">
                      <Select id="k-dir" name="direction" defaultValue="up">
                        <option value="up">At or above target</option>
                        <option value="down">At or below target</option>
                      </Select>
                    </Field>
                    <Field label="Currency (money only)" htmlFor="k-cur">
                      <Input id="k-cur" name="currency" maxLength={3} className="uppercase" placeholder={workspace.baseCurrency} />
                    </Field>
                    <Field label="Target" htmlFor="k-target">
                      <Input id="k-target" name="targetValue" type="number" step="any" required />
                    </Field>
                    <Field label="Actual so far (optional)" htmlFor="k-actual">
                      <Input id="k-actual" name="actualValue" type="number" step="any" />
                    </Field>
                  </div>
                </ActionForm>
              </details>
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quarter settings</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateQuarterAction.bind(null, q.quarterNumber)} submitLabel="Save" submitVariant="outline" resetOnSuccess={false}>
                <Field label="Focus (one line)" htmlFor="focus">
                  <Input id="focus" name="focus" defaultValue={q.focus ?? ""} maxLength={500} />
                </Field>
                <Field label="Available hours per week" htmlFor="capacityHoursPerWeek">
                  <Input id="capacityHoursPerWeek" name="capacityHoursPerWeek" type="number" min={0} max={120} step="0.5" defaultValue={q.capacityHoursPerWeek ?? ""} />
                </Field>
                <Field label="Mid-quarter review" htmlFor="midReviewOn">
                  <Input id="midReviewOn" name="midReviewOn" type="date" min={q.startDate} max={q.endDate} defaultValue={q.midReviewOn ?? ""} />
                </Field>
                <Field label="Quarter review" htmlFor="reviewOn">
                  <Input id="reviewOn" name="reviewOn" type="date" min={q.startDate} defaultValue={q.reviewOn ?? ""} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risks</CardTitle>
              <CardDescription>Scored likelihood × impact (1–25).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {risks.map((r) => (
                <div key={r.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Badge variant={r.score >= 15 ? "destructive" : r.score >= 8 ? "warning" : "outline"}>{r.score}</Badge>
                    <p className={r.status === "closed" ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{r.title}</p>
                    <form className="ml-auto" action={deleteRiskAction.bind(null, r.id)}>
                      <SubmitButton variant="ghost" size="icon" aria-label={`Delete risk ${r.title}`}>
                        <Trash2 aria-hidden />
                      </SubmitButton>
                    </form>
                  </div>
                  {r.mitigation ? <p className="text-xs text-muted-foreground">Mitigation: {r.mitigation}</p> : null}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">{RISK_STATUS_LABELS[r.status as RiskStatus]}</span>
                    {(["mitigated", "occurred", "closed", "open"] as const)
                      .filter((s) => s !== r.status)
                      .map((s) => (
                        <form key={s} action={setRiskStatusAction.bind(null, r.id, s)}>
                          <SubmitButton variant="outline" size="sm" className="h-7 px-2 text-xs">
                            {s === "open" ? "Reopen" : RISK_STATUS_LABELS[s]}
                          </SubmitButton>
                        </form>
                      ))}
                  </div>
                </div>
              ))}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add risk</summary>
                <ActionForm action={addRiskAction.bind(null, q.quarterNumber)} submitLabel="Add risk" submitVariant="outline" className="mt-3">
                  <Field label="Risk" htmlFor="r-title">
                    <Input id="r-title" name="title" required maxLength={300} placeholder="e.g. Day job overtime in March" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Likelihood (1–5)" htmlFor="r-l">
                      <Input id="r-l" name="likelihood" type="number" min={1} max={5} defaultValue={3} required />
                    </Field>
                    <Field label="Impact (1–5)" htmlFor="r-i">
                      <Input id="r-i" name="impact" type="number" min={1} max={5} defaultValue={3} required />
                    </Field>
                  </div>
                  <Field label="Mitigation" htmlFor="r-m">
                    <Textarea id="r-m" name="mitigation" rows={2} />
                  </Field>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
              <CardDescription>What this quarter needs from people, tools or other goals.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dependencies.map((d) => (
                <div key={d.id} className="flex items-start gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className={d.status === "resolved" ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{d.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {[d.goalTitle ? `Goal: ${d.goalTitle}` : null, d.neededBy ? `needed by ${d.neededBy}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <form action={setQuarterDependencyStatusAction.bind(null, d.id, d.status === "open" ? "resolved" : "open")}>
                    <SubmitButton variant="outline" size="sm" className="h-7 px-2 text-xs">
                      {d.status === "open" ? "Resolved" : "Reopen"}
                    </SubmitButton>
                  </form>
                  <form action={deleteQuarterDependencyAction.bind(null, d.id)}>
                    <SubmitButton variant="ghost" size="icon" aria-label={`Delete dependency ${d.description}`}>
                      <Trash2 aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              ))}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add dependency</summary>
                <ActionForm action={addQuarterDependencyAction.bind(null, q.quarterNumber)} submitLabel="Add dependency" submitVariant="outline" className="mt-3">
                  <Field label="Depends on" htmlFor="dep-desc">
                    <Input id="dep-desc" name="description" required maxLength={500} placeholder="e.g. Payment provider approval" />
                  </Field>
                  <Field label="Linked goal (optional)" htmlFor="dep-goal">
                    <Select id="dep-goal" name="dependsOnGoalId" defaultValue="">
                      <option value="">None</option>
                      {goalOptions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.isKeyResult ? "Key result" : GOAL_LEVEL_LABELS[g.level as GoalLevel]}: {g.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Needed by" htmlFor="dep-date">
                    <Input id="dep-date" name="neededBy" type="date" />
                  </Field>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>
                {q.midReviewOn ? `Mid-quarter check ${q.midReviewOn}. ` : ""}
                {q.reviewOn ? `Quarter review ${q.reviewOn}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveQuarterReviewAction.bind(null, q.quarterNumber)} submitLabel="Save review" submitVariant="outline" resetOnSuccess={false}>
                <Field label="What happened, what you learned, what changes next quarter" htmlFor="reviewSummary">
                  <Textarea id="reviewSummary" name="reviewSummary" rows={4} defaultValue={q.reviewSummary ?? ""} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="reviewed" defaultChecked={Boolean(q.reviewedAt)} className="size-4" /> Mark this quarter as reviewed
                </label>
              </ActionForm>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
