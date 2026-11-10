import { CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { GoalProgress } from "@/features/goals/components/goal-progress";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { cn } from "@/lib/utils";
import { saveRoadmapSettingsAction, updateYearAction } from "../server/actions";
import { loadRoadmap } from "../server/queries";
import type { Roadmap } from "../server/service";
import { GenerateRoadmapCard } from "./generate-roadmap-card";
import { PlannedVsActualChart } from "./planned-vs-actual-chart";

type Ready = Extract<Roadmap, { generated: true }>;
type QuarterTile = Ready["years"][number]["quarters"][number];

const stateBadge = {
  past: { label: "Past", variant: "outline" as const },
  current: { label: "Now", variant: "default" as const },
  future: { label: "Upcoming", variant: "outline" as const },
};

export async function RoadmapOverview() {
  const data = await loadRoadmap();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const roadmap = data.roadmap;
  if (!roadmap.generated) return <GenerateRoadmapCard weeklyCapacityHours={roadmap.workspace.profile?.weeklyCapacityHours ?? 15} />;

  const current = roadmap.currentQuarter;
  const totals = roadmap.plannedVsActual.reduce(
    (acc, q) => ({ planned: acc.planned + q.planned, delivered: acc.delivered + q.delivered }),
    { planned: 0, delivered: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Planned versus actual</CardTitle>
            <CardDescription>
              {totals.planned > 0
                ? `${totals.delivered} of ${totals.planned} planned deliverables delivered so far. The line shows objective completion, measured by key-result outcomes.`
                : "Add objectives, key results and deliverables to your quarters to see planned versus actual achievement."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlannedVsActualChart data={roadmap.plannedVsActual} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {current ? (
            <Card>
              <CardHeader>
                <CardDescription>Current quarter</CardDescription>
                <CardTitle>
                  <Link href={`/roadmap/q/${current.quarterNumber}`} className="hover:underline">
                    {current.label}: {current.startDate} → {current.endDate}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <QuarterMetrics q={current} />
                <Link href={`/roadmap/q/${current.quarterNumber}`} className={buttonVariants({ size: "sm", className: "self-start" })}>
                  Open quarter plan
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Journey not in progress</CardTitle>
                <CardDescription>Today is outside the five-year window.</CardDescription>
              </CardHeader>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Available time</CardTitle>
              <CardDescription>Used to check every quarter&apos;s plan against reality.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveRoadmapSettingsAction} submitLabel="Save" submitVariant="outline" resetOnSuccess={false}>
                <Field label="Hours per week" htmlFor="weeklyCapacityHours">
                  <Input
                    id="weeklyCapacityHours"
                    name="weeklyCapacityHours"
                    type="number"
                    min={0}
                    max={120}
                    step="0.5"
                    defaultValue={roadmap.weeklyCapacityHours}
                    className="max-w-32"
                    required
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="applyToFutureQuarters" defaultChecked className="size-4" /> Apply to the current and
                  future quarters
                </label>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {roadmap.years.map((year) => (
          <Card key={year.id} className={cn(year.state === "current" && "ring-2 ring-primary/30")}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>
                  Year {year.yearNumber} · {year.theme}
                </CardTitle>
                {year.isProvisional ? <Badge variant="outline">Provisional</Badge> : <Badge variant="success">Confirmed</Badge>}
                <Badge variant={stateBadge[year.state].variant}>{stateBadge[year.state].label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {year.startDate} → {year.endDate}
                </span>
              </div>
              <CardDescription className="whitespace-pre-wrap">{year.direction}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    Annual objectives
                    {year.annualCompletion !== null ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {year.annualCompletion}% complete · {year.expectedPct}% of the year elapsed
                      </span>
                    ) : null}
                  </h3>
                  <Link
                    href={`/goals/new?level=annual&start=${year.startDate}&end=${year.endDate}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Plus aria-hidden /> Annual objective
                  </Link>
                </div>
                {year.annualObjectives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No annual objectives yet.</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {year.annualObjectives.map((g) => (
                      <li key={g.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
                        <Link href={`/goals/${g.id}`} className="text-sm font-medium hover:underline">
                          {g.title}
                        </Link>
                        <GoalProgress goal={g} compact />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {year.quarters.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/roadmap/q/${q.quarterNumber}`}
                      className={cn(
                        "flex h-full flex-col gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-accent",
                        q.state === "current" && "border-primary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{q.label}</span>
                        <Badge variant={stateBadge[q.state].variant}>{stateBadge[q.state].label}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {q.startDate} → {q.endDate}
                      </span>
                      {q.focus ? <span className="line-clamp-2 text-xs">{q.focus}</span> : null}
                      <QuarterMetrics q={q} />
                      {q.reviewDue ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warning-ink">
                          <CircleAlert className="size-3" aria-hidden /> Review due
                        </span>
                      ) : q.reviewedAt ? (
                        <span className="text-xs text-success">Reviewed</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Edit year {year.yearNumber} direction</summary>
                <ActionForm action={updateYearAction.bind(null, year.yearNumber)} submitLabel="Save year plan" resetOnSuccess={false} className="mt-3">
                  <Field label="Theme" htmlFor={`theme-${year.yearNumber}`}>
                    <Input id={`theme-${year.yearNumber}`} name="theme" defaultValue={year.theme} required maxLength={120} />
                  </Field>
                  <Field label="Strategic direction" htmlFor={`direction-${year.yearNumber}`}>
                    <Textarea id={`direction-${year.yearNumber}`} name="direction" defaultValue={year.direction} rows={3} required />
                  </Field>
                  <Field label="Notes" htmlFor={`notes-${year.yearNumber}`}>
                    <Textarea id={`notes-${year.yearNumber}`} name="notes" defaultValue={year.notes ?? ""} rows={2} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="confirmed" defaultChecked={!year.isProvisional} className="size-4" /> I&apos;ve
                    reviewed this direction (no longer provisional)
                  </label>
                </ActionForm>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function QuarterMetrics({ q }: { q: QuarterTile }) {
  const a = q.actual;
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {a.objectives > 0 ? (
        <>
          <Progress
            value={a.objectiveCompletion ?? 0}
            expected={q.state === "current" ? q.expectedPct : undefined}
            label={`${q.label} objective completion`}
          />
          <span>
            {a.objectives} objective{a.objectives === 1 ? "" : "s"} · {a.objectiveCompletion ?? 0}% complete
            {a.objectivesAchieved ? ` · ${a.objectivesAchieved} achieved` : ""}
          </span>
        </>
      ) : (
        <span>No objectives yet</span>
      )}
      {a.deliverablesPlanned > 0 ? (
        <span>
          {a.deliverablesDelivered}/{a.deliverablesPlanned} deliverables
        </span>
      ) : null}
      {a.kpiAttainment !== null ? <span>KPIs {a.kpiAttainment}% of target</span> : null}
      {a.openRisks > 0 ? <span>{a.openRisks} open risk{a.openRisks === 1 ? "" : "s"}</span> : null}
    </div>
  );
}
