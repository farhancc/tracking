import { CircleAlert, Info, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { HealthBadge, StatusBadge } from "@/features/goals/components/badges";
import { GoalProgress } from "@/features/goals/components/goal-progress";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { GOAL_LEVEL_LABELS, MEASURE_UNIT_LABELS, MEASURE_UNITS, type GoalLevel, type GoalStatus } from "@/lib/domain/goals";
import { FOCUS_AREA_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, formatMinutes, type FocusArea, type WeeklyScorecard } from "@/lib/domain/weekly";
import { cn } from "@/lib/utils";
import {
  addWeekTaskAction,
  cancelTaskAction,
  carryAllAction,
  carryForwardAction,
  createWeeklyGoalAction,
  rescheduleTaskAction,
  reviewWeekAction,
  saveWeekPlanAction,
} from "../server/actions";
import { loadWeek } from "../server/queries";
import { WeekTaskRow } from "./week-task-row";
import { WeekTrendChart } from "./week-trend-chart";

function AddTaskForm({ weekStart, goalId, idPrefix }: { weekStart: string; goalId: string | null; idPrefix: string }) {
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Add task</summary>
      <ActionForm action={addWeekTaskAction.bind(null, weekStart, goalId)} submitLabel="Add task" submitVariant="outline" className="mt-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Task" htmlFor={`${idPrefix}-title`} className="sm:col-span-4">
            <Input id={`${idPrefix}-title`} name="title" required maxLength={300} placeholder="A concrete next action" />
          </Field>
          <Field label="Estimate" htmlFor={`${idPrefix}-est`} hint="e.g. 45m, 1h 30m">
            <Input id={`${idPrefix}-est`} name="estimatedMinutes" />
          </Field>
          <Field label="Deadline" htmlFor={`${idPrefix}-due`}>
            <Input id={`${idPrefix}-due`} name="dueOn" type="date" />
          </Field>
          <Field label="Priority" htmlFor={`${idPrefix}-prio`}>
            <Select id={`${idPrefix}-prio`} name="priority" defaultValue="3">
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="isDeliverable" className="size-4" /> Meaningful deliverable
          </label>
        </div>
      </ActionForm>
    </details>
  );
}

function Scorecard({ s, frozen }: { s: WeeklyScorecard; frozen: boolean }) {
  const icon = { positive: Sparkles, info: Info, warning: CircleAlert };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <span className="text-4xl font-semibold tabular-nums">{s.score ?? "–"}</span>
        <span className="pb-1 text-sm text-muted-foreground">/ 100{frozen ? " · as reviewed" : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        60% weekly-goal outcomes + 40% meaningful deliverables delivered. The number of tasks never raises the score.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Goal outcomes</dt>
          <dd className="font-medium">
            {s.goals.averageCompletion ?? 0}% · {s.goals.met}/{s.goals.total} met
          </dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Deliverables</dt>
          <dd className="font-medium">
            {s.deliverables.delivered}/{s.deliverables.planned}
            {s.deliverables.rate !== null ? ` · ${s.deliverables.rate}%` : ""}
          </dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Tasks done / unfinished</dt>
          <dd className="font-medium">
            {s.tasks.done} / {s.tasks.unfinished}
          </dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Time (est. → actual)</dt>
          <dd className="font-medium">
            {formatMinutes(s.time.estimatedMinutes)} → {formatMinutes(s.time.actualMinutes)}
          </dd>
        </div>
      </dl>
      {s.byArea.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {s.byArea.map((a) => (
            <li key={a.area} className="flex justify-between gap-2">
              <span>{FOCUS_AREA_LABELS[a.area]}</span>
              <span className="text-muted-foreground">
                {a.goals ? `${a.averageCompletion ?? 0}% outcome` : "no goal"} · {a.deliverablesDelivered}/{a.deliverablesPlanned} deliverables
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {s.insights.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {s.insights.map((i) => {
            const Icon = icon[i.level];
            return (
              <li key={i.message} className="flex items-start gap-2 text-sm">
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", i.level === "warning" ? "text-warning-ink" : i.level === "positive" ? "text-success" : "text-muted-foreground")}
                  aria-hidden
                />
                <span>{i.message}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export async function WeekView({ weekStart }: { weekStart?: string }) {
  const data = await loadWeek(weekStart);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const { week, plan, goalsByArea, otherTasks, unfinished, parentOptions, scorecard, frozenScorecard, trend, capacityHours, isCurrentWeek } = data;
  const ws = week.weekStart;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Week of {week.weekStart}
            </h1>
            {isCurrentWeek ? <Badge>This week</Badge> : null}
            {plan?.reviewedAt ? <Badge variant="success">Reviewed</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {week.weekStart} → {week.weekEnd}
            {plan?.focus ? ` · Focus: ${plan.focus}` : ""}
          </p>
        </div>
        <nav aria-label="Weeks" className="flex gap-2 text-sm">
          <Link href={`/week/${data.previousWeek}`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
            ← Previous
          </Link>
          {!isCurrentWeek ? (
            <Link href="/week" className="rounded-md border px-3 py-1.5 hover:bg-accent">
              This week
            </Link>
          ) : null}
          <Link href={`/week/${data.nextWeek}`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
            Next →
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {unfinished.length > 0 ? (
            <Card className="border-warning/50">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Unfinished from earlier weeks</CardTitle>
                    <CardDescription>Carry forward, reschedule or cancel. Nothing slips silently.</CardDescription>
                  </div>
                  <form action={carryAllAction.bind(null, ws)}>
                    <SubmitButton size="sm" variant="outline" pendingText="Carrying…">
                      Carry all into this week
                    </SubmitButton>
                  </form>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {unfinished.map((t) => (
                    <li key={t.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[`planned for week of ${t.plannedWeek}`, t.goalTitle, t.isDeliverable ? "deliverable" : null, t.carryCount ? `carried ×${t.carryCount}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={carryForwardAction.bind(null, t.id, ws)}>
                          <SubmitButton size="sm" variant="outline">
                            Carry here
                          </SubmitButton>
                        </form>
                        <ActionForm
                          action={rescheduleTaskAction.bind(null, t.id)}
                          submitLabel="Reschedule"
                          submitVariant="outline"
                          inline className="items-center gap-2"
                          submitClassName="h-8"
                        >
                          <Input name="dueOn" type="date" min={ws} aria-label={`New date for ${t.title}`} className="h-8 w-40" />
                        </ActionForm>
                        <form action={cancelTaskAction.bind(null, t.id)}>
                          <SubmitButton size="sm" variant="ghost">
                            Cancel
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {goalsByArea.map(({ area, goals }) => (
            <Card key={area}>
              <CardHeader>
                <CardTitle className="text-base">{FOCUS_AREA_LABELS[area as FocusArea]}</CardTitle>
                {goals.length === 0 ? <CardDescription>No {FOCUS_AREA_LABELS[area as FocusArea].toLowerCase()} goal this week.</CardDescription> : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {goals.map((g) => (
                  <section key={g.id} className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/goals/${g.id}`} className="font-medium hover:underline">
                        {g.title}
                      </Link>
                      <StatusBadge status={g.status as GoalStatus} />
                      <HealthBadge health={g.health} />
                    </div>
                    {g.parentTitle ? (
                      <p className="text-xs text-muted-foreground">
                        Serves {g.parentLevel ? GOAL_LEVEL_LABELS[g.parentLevel as GoalLevel].toLowerCase() : "objective"}:{" "}
                        <Link href={`/goals/${g.parentId}`} className="underline-offset-2 hover:underline">
                          {g.parentTitle}
                        </Link>
                      </p>
                    ) : null}
                    <GoalProgress goal={g} compact />
                    {g.tasks.length > 0 ? (
                      <ul className="flex flex-col divide-y rounded-lg border">
                        {g.tasks.map((t) => (
                          <WeekTaskRow key={t.id} task={t} />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Break this goal into concrete tasks. Mark the ones that produce a real output as deliverables.</p>
                    )}
                    <AddTaskForm weekStart={ws} goalId={g.id} idPrefix={`t-${g.id.slice(0, 8)}`} />
                  </section>
                ))}
                <details className="rounded-lg border border-dashed p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    <Plus className="mr-1 inline size-4" aria-hidden />
                    Add {FOCUS_AREA_LABELS[area as FocusArea].toLowerCase()} goal
                  </summary>
                  {parentOptions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No monthly, quarterly or annual objective covers this week. Create one in{" "}
                      <Link href="/roadmap" className="underline">
                        the roadmap
                      </Link>{" "}
                      first: every weekly goal must serve a bigger objective.
                    </p>
                  ) : (
                    <ActionForm action={createWeeklyGoalAction.bind(null, ws, area)} submitLabel="Add weekly goal" submitVariant="outline" className="mt-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Serves objective" htmlFor={`wg-parent-${area}`} className="sm:col-span-2">
                          <Select id={`wg-parent-${area}`} name="parentId" required defaultValue="">
                            <option value="" disabled>
                              Choose a monthly, quarterly or annual objective…
                            </option>
                            {parentOptions.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.isKeyResult ? "Key result" : GOAL_LEVEL_LABELS[p.level as GoalLevel]}: {p.title}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Weekly goal" htmlFor={`wg-title-${area}`} className="sm:col-span-2">
                          <Input id={`wg-title-${area}`} name="title" required maxLength={200} />
                        </Field>
                        <Field label="Success metric" htmlFor={`wg-metric-${area}`}>
                          <Input id={`wg-metric-${area}`} name="successMetric" required maxLength={200} placeholder="e.g. Meetings booked" />
                        </Field>
                        <Field label="Unit" htmlFor={`wg-unit-${area}`}>
                          <Select id={`wg-unit-${area}`} name="unit" defaultValue="count">
                            {MEASURE_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {MEASURE_UNIT_LABELS[u]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Measured as" htmlFor={`wg-mode-${area}`}>
                          <Select id={`wg-mode-${area}`} name="measurementMode" defaultValue="cumulative">
                            <option value="cumulative">Running total</option>
                            <option value="latest">Latest value</option>
                          </Select>
                        </Field>
                        <Field label="Target" htmlFor={`wg-target-${area}`}>
                          <Input id={`wg-target-${area}`} name="targetValue" type="number" step="any" required />
                        </Field>
                        <Field label="Priority" htmlFor={`wg-prio-${area}`}>
                          <Select id={`wg-prio-${area}`} name="priority" defaultValue="3">
                            {TASK_PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {TASK_PRIORITY_LABELS[p]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </ActionForm>
                  )}
                </details>
              </CardContent>
            </Card>
          ))}

          {otherTasks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Other tasks this week</CardTitle>
                <CardDescription>Planned this week but not under a weekly goal.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {otherTasks.map((t) => (
                    <WeekTaskRow key={t.id} task={t} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly scorecard</CardTitle>
            </CardHeader>
            <CardContent>
              <Scorecard s={frozenScorecard ?? scorecard} frozen={Boolean(frozenScorecard)} />
              {frozenScorecard && frozenScorecard.score !== scorecard.score ? (
                <p className="mt-3 text-xs text-muted-foreground">Live score since the review: {scorecard.score ?? "–"}.</p>
              ) : null}
            </CardContent>
          </Card>

          {trend.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent weeks</CardTitle>
              </CardHeader>
              <CardContent>
                <WeekTrendChart data={trend} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Week settings</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveWeekPlanAction.bind(null, ws)} submitLabel="Save" submitVariant="outline" resetOnSuccess={false}>
                <Field label="Focus" htmlFor="focus">
                  <Input id="focus" name="focus" defaultValue={plan?.focus ?? ""} maxLength={500} />
                </Field>
                <Field label="Available hours this week" htmlFor="capacityHours">
                  <Input id="capacityHours" name="capacityHours" type="number" min={0} max={120} step="0.5" defaultValue={capacityHours ?? ""} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Weekly review</CardTitle>
              <CardDescription>
                {plan?.reviewedAt
                  ? `Reviewed ${plan.reviewedAt.toISOString().slice(0, 10)}. Saving again updates the frozen scorecard.`
                  : "Completing the review freezes this week's scorecard for your history."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Link href={`/review/${ws}`} className="text-sm font-medium underline-offset-2 hover:underline">
                Open the full weekly review: report by pillar, the twelve questions, next week&rsquo;s suggestions →
              </Link>
              <ActionForm action={reviewWeekAction.bind(null, ws)} submitLabel={plan?.reviewedAt ? "Update review" : "Complete review"} resetOnSuccess={false}>
                <Field label="Wins" htmlFor="wins">
                  <Textarea id="wins" name="wins" rows={2} defaultValue={plan?.wins ?? ""} />
                </Field>
                <Field label="Lessons" htmlFor="lessons">
                  <Textarea id="lessons" name="lessons" rows={2} defaultValue={plan?.lessons ?? ""} />
                </Field>
                <Field label="Notes for next week" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={2} defaultValue={plan?.notes ?? ""} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
