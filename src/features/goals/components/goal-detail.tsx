import { ArrowLeft, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { diffDays } from "@/lib/domain/dates";
import {
  GOAL_CATEGORY_LABELS,
  GOAL_LEVEL_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_STATUSES,
  LINK_KIND_LABELS,
  LINK_KINDS,
  defaultChildLevel,
  formatMeasure,
  type GoalCategory,
  type GoalLevel,
  type GoalStatus,
  type LinkKind,
  type MeasureUnit,
} from "@/lib/domain/goals";
import {
  addDependencyAction,
  addLinkAction,
  addMeasurementAction,
  archiveGoalAction,
  createTaskAction,
  deleteMeasurementAction,
  removeDependencyAction,
  removeLinkAction,
  setGoalStatusAction,
  setTaskStatusAction,
} from "../server/actions";
import type { GoalDetail, GoalSummary } from "../server/service";
import { HealthBadge, PillarTag, PriorityBadge, StatusBadge } from "./badges";
import { GoalProgress } from "./goal-progress";
import { KeyResultsPanel } from "./key-results-panel";
import { MeasurementChart } from "./measurement-chart";

type Props = GoalDetail & { options: GoalSummary[] };

function GoalRef({ goal }: { goal: GoalSummary }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Link href={`/goals/${goal.id}`} className="truncate text-sm font-medium hover:underline">
        {goal.title}
      </Link>
      <span className="text-xs text-muted-foreground">
        {GOAL_LEVEL_LABELS[goal.level as GoalLevel]} · {GOAL_STATUS_LABELS[goal.status as GoalStatus]} ·{" "}
        {goal.completionPct}%
      </span>
    </div>
  );
}

/** The value as it stood after each measurement (running total for cumulative goals), oldest first. */
function chartPoints(goal: Props["goal"], measurements: Props["measurements"]) {
  const ascending = [...measurements].reverse();
  return ascending.reduce<{ date: string; value: number }[]>((acc, m) => {
    const previous = acc.length > 0 ? acc[acc.length - 1].value : goal.baselineValue;
    const value = goal.measurementMode === "cumulative" ? previous + m.value : m.value;
    return [...acc, { date: m.measuredOn, value }];
  }, []);
}

export function GoalDetailView(props: Props) {
  const { goal, pillar, ancestors, children, keyResults, childSummary, prerequisites, dependents, links, measurements, tasks, taskSummary, achievement, blockers, workspace, options } = props;
  const unit = goal.unit as MeasureUnit;
  const fmt = (v: number) => formatMeasure(v, unit, goal.currency);
  const nextLevel = defaultChildLevel(goal.level as GoalLevel);
  const daysLeft = diffDays(workspace.today, goal.targetDate);

  const points = chartPoints(goal, measurements);
  const byKeyResults = goal.measurementMode === "key_results";

  const linkedIds = new Set([goal.id, ...prerequisites.map((p) => p.goal.id)]);
  const dependencyChoices = options.filter((o) => !linkedIds.has(o.id));
  const relatedIds = new Set([goal.id, ...links.map((l) => l.goal.id)]);
  const linkChoices = options.filter((o) => !relatedIds.has(o.id));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/goals" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Goals
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link href={`/goals/${a.id}`} className="max-w-48 truncate hover:text-foreground">
              {a.title}
            </Link>
          </span>
        ))}
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {goal.isKeyResult ? "Key result" : GOAL_LEVEL_LABELS[goal.level as GoalLevel]}
          {goal.category ? <span>· {GOAL_CATEGORY_LABELS[goal.category as GoalCategory]}</span> : null}
          <PillarTag pillar={pillar} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={goal.status as GoalStatus} />
          <HealthBadge health={goal.health} />
          <PriorityBadge priority={goal.priority} />
          {goal.archivedAt ? <span className="text-xs text-destructive">Archived</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/goals/${goal.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit
          </Link>
          {nextLevel ? (
            <Link
              href={`/goals/new?parentId=${goal.id}&level=${nextLevel}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Plus aria-hidden /> Add {GOAL_LEVEL_LABELS[nextLevel].toLowerCase()}
            </Link>
          ) : null}
          <form action={archiveGoalAction.bind(null, goal.id, goal.parentId)}>
            <SubmitButton variant="ghost" size="sm" pendingText="Archiving…" title="Archives this goal and its sub-goals">
              Archive
            </SubmitButton>
          </form>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Outcome: {goal.successMetric}</CardTitle>
              <CardDescription>
                {byKeyResults
                  ? "Progress is the average outcome progress of this objective's key results."
                  : "Progress comes only from measured outcomes."}{" "}
                {goal.currentValueAsOf ? `Last measured ${goal.currentValueAsOf}.` : "No measurements yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["Baseline", fmt(goal.baselineValue)],
                  ["Current", fmt(goal.currentValue)],
                  ["Target", fmt(goal.targetValue)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted px-2 py-3">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <GoalProgress goal={goal} />
              <p className="text-xs text-muted-foreground">
                {goal.direction === "decrease" ? "Reduction goal. " : ""}Expected by today: {goal.expectedPct}% ·{" "}
                {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days past the target date`}
              </p>
              {goal.isTargetMet && goal.status !== "achieved" ? (
                <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                  The target has been reached. Mark the goal achieved below when you&apos;re satisfied it holds.
                </p>
              ) : null}
              {byKeyResults ? (
                <KeyResultsPanel objective={goal} keyResults={keyResults} baseCurrency={workspace.baseCurrency} />
              ) : null}
              <MeasurementChart points={points} target={goal.targetValue} label={goal.successMetric} />

              {byKeyResults ? null : (
              <ActionForm
                action={addMeasurementAction.bind(null, goal.id)}
                submitLabel="Log measurement"
                pendingLabel="Logging…"
                className="rounded-lg border p-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Date" htmlFor="measuredOn">
                    <Input id="measuredOn" name="measuredOn" type="date" defaultValue={workspace.today} required />
                  </Field>
                  <Field
                    label={goal.measurementMode === "cumulative" ? "Amount to add" : "Value now"}
                    htmlFor="value"
                    hint={unit === "boolean" ? "1 = yes, 0 = no" : undefined}
                  >
                    <Input id="value" name="value" type="number" step="any" required />
                  </Field>
                  <Field label="Note (optional)" htmlFor="note">
                    <Input id="note" name="note" maxLength={2000} />
                  </Field>
                </div>
              </ActionForm>
              )}

              {measurements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Measurement history</caption>
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium">{goal.measurementMode === "cumulative" ? "Added" : "Value"}</th>
                        <th className="py-2 font-medium">Note</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="py-2 tabular-nums">{m.measuredOn}</td>
                          <td className="py-2 tabular-nums">{fmt(m.value)}</td>
                          <td className="py-2 text-muted-foreground">{m.note}</td>
                          <td className="py-2 text-right">
                            <form action={deleteMeasurementAction.bind(null, goal.id, m.id)}>
                              <SubmitButton variant="ghost" size="icon" aria-label={`Delete measurement of ${m.measuredOn}`}>
                                <Trash2 aria-hidden />
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sub-goals</CardTitle>
              <CardDescription>
                {childSummary.total === 0
                  ? "No sub-goals yet."
                  : `${childSummary.achieved} of ${childSummary.total} achieved. This is shown for context only: this goal's progress comes from its own success metric.`}
              </CardDescription>
            </CardHeader>
            {children.length > 0 ? (
              <CardContent className="flex flex-col gap-3">
                {children.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/goals/${c.id}`} className="font-medium hover:underline">
                        {c.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{GOAL_LEVEL_LABELS[c.level as GoalLevel]}</span>
                    </div>
                    <GoalProgress goal={c} compact />
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks (activity)</CardTitle>
              <CardDescription>
                {taskSummary.total > 0 ? `${taskSummary.done} of ${taskSummary.total} done. ` : ""}
                Tasks help you act. Completing them never completes this goal, only the measured outcome does.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tasks.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <form action={setTaskStatusAction.bind(null, t.id, t.status === "done" ? "todo" : "done")}>
                        <SubmitButton
                          variant="outline"
                          size="sm"
                          aria-label={t.status === "done" ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
                        >
                          {t.status === "done" ? "✓" : "○"}
                        </SubmitButton>
                      </form>
                      <span className={t.status === "done" ? "text-sm text-muted-foreground line-through" : "text-sm"}>
                        {t.title}
                      </span>
                      {t.dueOn ? <span className="ml-auto text-xs text-muted-foreground">{t.dueOn}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={createTaskAction.bind(null, goal.id)} submitLabel="Add task" submitVariant="outline">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="New task" htmlFor="task-title">
                    <Input id="task-title" name="title" required maxLength={300} />
                  </Field>
                  <Field label="Due (optional)" htmlFor="task-due">
                    <Input id="task-due" name="dueOn" type="date" />
                  </Field>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                {achievement.allowed
                  ? "The outcome supports marking this goal achieved."
                  : "Achieved is not available yet:"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!achievement.allowed ? (
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {achievement.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={setGoalStatusAction.bind(null, goal.id)} submitLabel="Update status" resetOnSuccess={false}>
                <Field label="Status" htmlFor="status">
                  {/* key: React resets uncontrolled fields after an action; remount so the saved status shows */}
                  <Select key={goal.status} id="status" name="status" defaultValue={goal.status}>
                    {GOAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {GOAL_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Start</dt>
                <dd className="tabular-nums">{goal.startDate}</dd>
                <dt className="text-muted-foreground">Target</dt>
                <dd className="tabular-nums">{goal.targetDate}</dd>
                <dt className="text-muted-foreground">Measured as</dt>
                <dd>{goal.measurementMode === "cumulative" ? "Running total" : "Latest value"}</dd>
                {goal.achievedAt ? (
                  <>
                    <dt className="text-muted-foreground">Achieved</dt>
                    <dd>{goal.achievedAt.toISOString().slice(0, 10)}</dd>
                  </>
                ) : null}
              </dl>
              {goal.description ? <p className="whitespace-pre-wrap">{goal.description}</p> : null}
              {goal.notes ? (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground">Notes</h4>
                  <p className="whitespace-pre-wrap">{goal.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
              <CardDescription>
                Blocking prerequisites must be achieved before this goal can be.
                {blockers.length > 0 ? ` ${blockers.length} still blocking.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {prerequisites.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Depends on</h4>
                  {prerequisites.map((p) => (
                    <div key={p.goal.id} className="flex items-start gap-2">
                      {p.isBlocking && p.goal.status !== "achieved" ? (
                        <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Blocking" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      <GoalRef goal={p.goal} />
                      <form className="ml-auto" action={removeDependencyAction.bind(null, goal.id, p.goal.id)}>
                        <SubmitButton variant="ghost" size="icon" aria-label={`Remove dependency on ${p.goal.title}`}>
                          <Trash2 aria-hidden />
                        </SubmitButton>
                      </form>
                    </div>
                  ))}
                </section>
              ) : null}
              {dependents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Required by</h4>
                  {dependents.map((d) => (
                    <GoalRef key={d.goal.id} goal={d.goal} />
                  ))}
                </section>
              ) : null}
              {dependencyChoices.length > 0 ? (
                <ActionForm action={addDependencyAction.bind(null, goal.id)} submitLabel="Add dependency" submitVariant="outline">
                  <Field label="This goal depends on" htmlFor="dependsOnGoalId">
                    <Select id="dependsOnGoalId" name="dependsOnGoalId" required defaultValue="">
                      <option value="" disabled>
                        Choose a goal…
                      </option>
                      {dependencyChoices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {GOAL_LEVEL_LABELS[o.level as GoalLevel]}: {o.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isBlocking" defaultChecked className="size-4" /> Blocking
                  </label>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related goals</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {links.map((l) => (
                <div key={l.goal.id} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{LINK_KIND_LABELS[l.kind as LinkKind]}</span>
                  <GoalRef goal={l.goal} />
                  <form className="ml-auto" action={removeLinkAction.bind(null, goal.id, l.goal.id)}>
                    <SubmitButton variant="ghost" size="icon" aria-label={`Unlink ${l.goal.title}`}>
                      <Trash2 aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              ))}
              {linkChoices.length > 0 ? (
                <ActionForm action={addLinkAction.bind(null, goal.id)} submitLabel="Link goal" submitVariant="outline">
                  <Field label="Goal" htmlFor="relatedGoalId">
                    <Select id="relatedGoalId" name="relatedGoalId" required defaultValue="">
                      <option value="" disabled>
                        Choose a goal…
                      </option>
                      {linkChoices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {GOAL_LEVEL_LABELS[o.level as GoalLevel]}: {o.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Relationship" htmlFor="kind">
                    <Select id="kind" name="kind" defaultValue="related">
                      {LINK_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {LINK_KIND_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
