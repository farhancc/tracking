import { AlertTriangle, CheckCircle2, Minus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { MISS_REASON_LABELS, MISS_REASONS, REVIEW_QUESTIONS, type Observation } from "@/lib/domain/review";
import { FOCUS_AREA_LABELS, FOCUS_AREAS, type FocusArea } from "@/lib/domain/weekly";
import { cn } from "@/lib/utils";
import { approveSuggestionAction, saveReviewAction, setFocusAction } from "../server/actions";
import { loadReview } from "../server/queries";

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (m: Record<string, number>) =>
  Object.entries(m)
    .filter(([, v]) => v)
    .map(([c, v]) => new Intl.NumberFormat("en", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v))
    .join(" + ") || "none";

function ObservationLine({ o }: { o: Observation }) {
  const Icon = o.tone === "good" ? CheckCircle2 : o.tone === "concern" ? AlertTriangle : Minus;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", o.tone === "good" && "text-success", o.tone === "concern" && "text-warning-ink", o.tone === "neutral" && "text-muted-foreground")} aria-hidden />
      <span>
        <span className="sr-only">{o.tone === "concern" ? "Concern: " : o.tone === "good" ? "Good: " : ""}</span>
        {o.text}
      </span>
    </li>
  );
}

export async function ReviewView({ weekStart }: { weekStart?: string }) {
  if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) notFound();
  const data = await loadReview(weekStart).catch((e: { status?: number; code?: string }) => {
    if (e?.status === 400 || e?.code === "week_not_started") notFound();
    throw e;
  });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const s = data.signals;
  const a = data.answers;
  const missed = s.goals.filter((g) => !g.met);
  const completed = s.goals.filter((g) => g.met);
  const reasonOf = new Map(a.missed.map((m) => [m.goalId, m]));
  const pillarName = (k: string) => data.pillars.find((p) => p.key === k)?.name ?? k;
  const pillarObs = (k: string | null) => data.observations.filter((o) => o.pillar === k);
  const wk = data.week.weekStart;

  const pillarCards: { key: string; numbers: [string, string][] }[] = [
    {
      key: "sales",
      numbers: [
        ["Activities", `${s.sales.activities} (${s.sales.calls} calls, ${s.sales.connected} connected)`],
        ["Meetings booked", String(s.sales.meetings)],
        ["New prospects", `${s.sales.newProspects}${s.sales.prospectsFromContent ? ` (${s.sales.prospectsFromContent} from content)` : ""}`],
        ["Deals won", s.sales.dealsWon ? `${s.sales.dealsWon} · ${money(s.sales.wonByCurrency)}` : "0"],
        ["Communication practice", `${s.sales.practiceSessions} session(s), ${s.sales.practiceMinutes} min`],
        ["Psychology reviews", String(s.sales.psychReviews)],
      ],
    },
    {
      key: "product",
      numbers: [
        ["Product revenue", money(s.product.revenueByCurrency)],
        ["Customer interviews", `${s.product.interviews}${s.product.committed ? ` (${s.product.committed} committed)` : ""}`],
        ["Feedback received", String(s.product.feedback)],
        ["Features shipped", `${s.product.featuresShipped} · ${s.product.releases} release(s)`],
        ["Validation steps validated", String(s.product.stepsValidated)],
      ],
    },
    {
      key: "brand",
      numbers: [
        ["Content published", String(s.brand.published)],
        ["Prospects from content", String(s.brand.attributedProspects)],
      ],
    },
    {
      key: "wealth",
      numbers: [
        ["Income recorded", money(s.wealth.incomeByCurrency)],
        ["Spending recorded", s.wealth.currency ? money({ [s.wealth.currency]: s.wealth.expenses }) : String(s.wealth.expenses)],
      ],
    },
  ];
  const textArea = (name: keyof typeof a, rows = 2, hint?: string) => {
    const q = REVIEW_QUESTIONS.find((x) => x.key === name)!;
    return (
      <Field label={`${REVIEW_QUESTIONS.indexOf(q) + 1}. ${q.label}`} htmlFor={`rv-${name}`} hint={hint}>
        <Textarea id={`rv-${name}`} name={name} rows={rows} defaultValue={(a[name] as string | null) ?? ""} />
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly review</h1>
          <p className="text-sm text-muted-foreground">
            Week of {fmtDate(wk)} – {fmtDate(data.week.weekEnd)} ·{" "}
            {data.review?.completedAt ? `completed ${data.review.completedAt.toISOString().slice(0, 10)}` : data.review ? "draft" : "not started"}
            {data.scorecard.score != null ? ` · score ${data.scorecard.score}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/review/${data.previousWeek}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" aria-label="Previous week">
            ←
          </Link>
          {data.canGoForward ? (
            <Link href={`/review/${data.nextWeek}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" aria-label="Next week">
              →
            </Link>
          ) : null}
          <Link href={`/week/${wk}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Week plan
          </Link>
        </div>
      </div>

      <section aria-labelledby="obs-h" className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle id="obs-h" className="text-base">
              What the data says
            </CardTitle>
            <CardDescription>Taken from what you tracked this week. No interpretation added.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {pillarObs(null).map((o) => (
                <ObservationLine key={o.text} o={o} />
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recurring patterns</CardTitle>
            <CardDescription>Across this and up to seven earlier completed reviews; each needs at least three occurrences.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.patterns.length === 0 ? <p className="text-sm text-muted-foreground">No recurring pattern yet{data.pastReviews.length < 2 ? ": complete a few more reviews" : ""}.</p> : null}
            <ul className="flex flex-col gap-2">
              {data.patterns.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="pillars-h" className="flex flex-col gap-3">
        <h2 id="pillars-h" className="text-lg font-semibold">
          Performance by pillar
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {pillarCards.map((p) => {
            const goals = s.goals.filter((g) => g.pillarKey === p.key);
            return (
              <Card key={p.key} className="min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{pillarName(p.key)}</CardTitle>
                  <CardDescription>
                    {goals.length ? `${goals.filter((g) => g.met).length} of ${goals.length} weekly goal(s) met` : "No weekly goals"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <dl className="grid grid-cols-1 gap-1 text-sm">
                    {p.numbers.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="flex flex-col gap-1.5">
                    {pillarObs(p.key).map((o) => (
                      <ObservationLine key={o.text} o={o} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Also this week: {s.learning.readingMinutes} min reading{s.learning.completed.length ? `, finished ${s.learning.completed.join(", ")}` : ""}.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The twelve questions</CardTitle>
          <CardDescription>The first three come from your data. Write the rest in a sentence or two; save a draft any time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveReviewAction.bind(null, wk)} submitLabel="Save draft" submitVariant="outline" resetOnSuccess={false}>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className="text-sm font-medium">1. {REVIEW_QUESTIONS[0].label}</p>
                <ul className="mt-1 list-disc pl-4 text-sm">
                  {s.goals.length === 0 ? <li className="text-muted-foreground">No weekly goals were planned.</li> : null}
                  {s.goals.map((g) => (
                    <li key={g.id}>
                      {g.title} <span className="text-xs text-muted-foreground">({g.completionPct ?? 0}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">2. {REVIEW_QUESTIONS[1].label}</p>
                <ul className="mt-1 list-disc pl-4 text-sm">
                  {completed.map((g) => (
                    <li key={g.id}>{g.title}</li>
                  ))}
                  {s.deliverables.titles.map((t) => (
                    <li key={t}>
                      {t} <span className="text-xs text-muted-foreground">(deliverable)</span>
                    </li>
                  ))}
                  {!completed.length && !s.deliverables.titles.length ? <li className="text-muted-foreground">No goals met or deliverables finished.</li> : null}
                </ul>
                <Textarea name="completedNotes" rows={2} defaultValue={a.completedNotes ?? ""} placeholder="Anything else you finished that isn't tracked" aria-label="Other things completed" className="mt-2" />
              </div>
              <div>
                <p className="text-sm font-medium">3. {REVIEW_QUESTIONS[2].label}</p>
                <ul className="mt-1 list-disc pl-4 text-sm">
                  {missed.length === 0 ? <li className="text-muted-foreground">None.</li> : null}
                  {missed.map((g) => (
                    <li key={g.id}>
                      {g.title} <span className="text-xs text-muted-foreground">({g.completionPct ?? 0}% of {g.targetValue})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {missed.length ? (
              <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">4. {REVIEW_QUESTIONS[3].label}</legend>
                {missed.map((g) => (
                  <div key={g.id} className="grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="missedGoal" value={g.id} />
                    <Field label={g.title} htmlFor={`reason-${g.id}`}>
                      <Select id={`reason-${g.id}`} name={`reason_${g.id}`} defaultValue={reasonOf.get(g.id)?.reason ?? ""}>
                        <option value="">Pick a reason…</option>
                        {MISS_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {MISS_REASON_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="What exactly happened" htmlFor={`note-${g.id}`} className="sm:col-span-2">
                      <Input id={`note-${g.id}`} name={`note_${g.id}`} defaultValue={reasonOf.get(g.id)?.note ?? ""} maxLength={1000} />
                    </Field>
                  </div>
                ))}
              </fieldset>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {textArea("biggestAchievement")}
              {textArea("learned")}
              {textArea("revenue", 2, `Tracked: deals won ${money(s.sales.wonByCurrency)}, product ${money(s.product.revenueByCurrency)}, income ${money(s.wealth.incomeByCurrency)}.`)}
              {textArea("interest", 2, `Tracked: ${s.sales.newProspects} new prospects (${s.sales.prospectsFromContent} from content), ${s.product.interviews} interviews (${s.product.committed} committed), ${s.product.feedback} feedback, ${s.brand.published} published.`)}
              {textArea(
                "wastedTime",
                2,
                s.time.actualMinutes
                  ? `Tracked: ${Math.round((s.time.routineMinutes / Math.max(1, s.time.actualMinutes)) * 100)}% of logged time on non-deliverables${s.carried.chronic.length ? `; ${s.carried.chronic.length} task(s) carried 2+ times` : ""}.`
                  : undefined,
              )}
              {textArea("stopDoing")}
              {textArea("continueDoing")}
              {textArea("changeNextWeek")}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" name="intent" value="complete">
                {data.review?.completedAt ? "Update completed review" : "Complete review"}
              </Button>
              <span className="text-xs text-muted-foreground">Completing needs a reason for every missed goal and freezes this week&rsquo;s report.</span>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suggested goals for the week of {fmtDate(data.nextWeek)}</CardTitle>
          <CardDescription>From this week&rsquo;s results. Nothing is added until you approve it, and you can change any field first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions: every weekly goal was met and every pillar with an open objective had a goal.</p> : null}
          {data.suggestions.map((sg) => (
            <details key={sg.key} className="rounded-lg border p-3" open={!sg.approved}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{sg.title}</span>
                <Badge variant={sg.approved ? "success" : "outline"}>{sg.approved ? "Added" : sg.kind === "pillar_gap" ? "Gap" : sg.kind === "smaller" ? "Smaller" : "Retry"}</Badge>
                <span className="text-xs text-muted-foreground">{sg.reason}</span>
              </summary>
              {!sg.approved ? (
                <ActionForm action={approveSuggestionAction.bind(null, wk)} submitLabel="Approve" className="mt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Goal" htmlFor={`sg-title-${sg.key}`} className="sm:col-span-2">
                      <Input id={`sg-title-${sg.key}`} name="title" defaultValue={sg.title} required maxLength={200} />
                    </Field>
                    <Field label="Focus area" htmlFor={`sg-area-${sg.key}`}>
                      <Select id={`sg-area-${sg.key}`} name="focusArea" defaultValue={sg.focusArea}>
                        {FOCUS_AREAS.map((f) => (
                          <option key={f} value={f}>
                            {FOCUS_AREA_LABELS[f as FocusArea]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Serves objective" htmlFor={`sg-parent-${sg.key}`}>
                      <Select id={`sg-parent-${sg.key}`} name="parentId" defaultValue={sg.parentId ?? ""}>
                        {data.parentOptions.map((p) => (
                          <option key={p.objectiveId} value={p.objectiveId}>
                            {p.objectiveTitle}
                          </option>
                        ))}
                        {sg.parentId && !data.parentOptions.some((p) => p.objectiveId === sg.parentId) ? <option value={sg.parentId}>{sg.parentTitle ?? "This goal's objective"}</option> : null}
                      </Select>
                    </Field>
                    <Field label="Success metric" htmlFor={`sg-metric-${sg.key}`}>
                      <Input id={`sg-metric-${sg.key}`} name="successMetric" defaultValue={sg.successMetric} required maxLength={200} />
                    </Field>
                    <Field label="Target" htmlFor={`sg-target-${sg.key}`}>
                      <Input id={`sg-target-${sg.key}`} name="targetValue" type="number" step="any" defaultValue={sg.targetValue} required />
                    </Field>
                  </div>
                </ActionForm>
              ) : null}
            </details>
          ))}
          {a.changeNextWeek ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Next week&rsquo;s focus: <span className="italic">&ldquo;{a.changeNextWeek}&rdquo;</span>
              </span>
              <ActionForm action={setFocusAction.bind(null, wk, a.changeNextWeek)} submitLabel="Use as focus" submitVariant="outline" submitClassName="h-8 text-xs" className="flex-row items-center gap-2">
                {null}
              </ActionForm>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {data.nextWeekGoals} goal(s) already planned for that week ·{" "}
            <Link href={`/week/${data.nextWeek}`} className="underline-offset-2 hover:underline">
              open the week plan
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
