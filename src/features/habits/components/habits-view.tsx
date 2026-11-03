import { Check } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { MIN_CORRELATION_DAYS, WEEKDAY_SHORT } from "@/lib/domain/habits";
import { cn } from "@/lib/utils";
import { addSuggestedAction, checkInAction, createHabitAction, removeRestDayAction, restDayAction, skipWithReasonAction } from "../server/actions";
import { loadHabits } from "../server/queries";
import { DayDot } from "./day-dot";
import { ConsistencyTrendChart } from "./habit-charts";
import { ScheduleFields } from "./schedule-fields";

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const scheduleText = (h: { scheduleKind: string; scheduleDays: number[]; weeklyTarget: number | null }) =>
  h.scheduleKind === "weekly"
    ? `${h.weeklyTarget}× a week`
    : h.scheduleDays.length === 7
      ? "Every day"
      : h.scheduleDays.join() === "1,2,3,4,5"
        ? "Weekdays"
        : [1, 2, 3, 4, 5, 6, 0]
            .filter((d) => h.scheduleDays.includes(d))
            .map((d) => WEEKDAY_SHORT[d])
            .join(", ");

export async function HabitsView() {
  const data = await loadHabits();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const todayRest = data.restDays.find((r) => r.day === data.today);
  const due = data.items.filter((i) => i.today.expected);
  const doneToday = due.filter((i) => i.today.status === "done").length;
  const withMisses = data.items.filter((i) => i.missed.missedDays.length || i.missed.missedWeeks.length).sort((a, b) => b.missed.missedDays.length + b.missed.missedWeeks.length - (a.missed.missedDays.length + a.missed.missedWeeks.length));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">Consistency over perfection. A missed day is information, not a failure, and rest days are part of the plan.</p>
        </div>
        {todayRest ? (
          <form action={removeRestDayAction.bind(null, todayRest.id)}>
            <SubmitButton variant="outline">Rest day today · undo</SubmitButton>
          </form>
        ) : (
          <ActionForm action={restDayAction} submitLabel="Take today off" submitVariant="outline" inline submitClassName="h-9">
            <input type="hidden" name="day" value={data.today} />
            <Input name="reason" placeholder="Reason (optional)" aria-label="Reason for the rest day" className="h-9 w-44" maxLength={200} />
          </ActionForm>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Today{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {todayRest ? "rest day: nothing is expected" : `${doneToday} of ${due.length} done`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {due.map(({ habit: h, today, weekDone }) => (
              <li key={h.id} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <form action={checkInAction.bind(null, h.id, data.today, today.status === "done" ? null : "done")} className="min-w-0 flex-1">
                    <SubmitButton
                      variant="outline"
                      className={cn("h-12 w-full justify-start gap-3 px-3 text-left", today.status === "done" && "border-success bg-success/10", today.status === "rest" && "text-muted-foreground")}
                      aria-pressed={today.status === "done"}
                      aria-label={`${h.name}: ${today.status === "done" ? "done, tap to undo" : "tap when done"}`}
                    >
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", today.status === "done" && "border-success bg-success text-white")}>
                        {today.status === "done" ? <Check className="size-4" aria-hidden /> : null}
                      </span>
                      <span className="min-w-0 truncate">{h.name}</span>
                      {today.status === "rest" ? <Badge variant="outline">Rest</Badge> : null}
                      {today.status === "skipped" ? <Badge variant="outline">Skipped</Badge> : null}
                      {h.scheduleKind === "weekly" ? (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {weekDone}/{h.weeklyTarget} this week
                        </span>
                      ) : null}
                    </SubmitButton>
                  </form>
                  <form action={checkInAction.bind(null, h.id, data.today, today.status === "rest" ? null : "rest")}>
                    <SubmitButton variant="ghost" className="h-12 px-2 text-xs" aria-label={today.status === "rest" ? `Undo rest for ${h.name}` : `Rest day for ${h.name}`}>
                      {today.status === "rest" ? "Undo" : "Rest"}
                    </SubmitButton>
                  </form>
                </div>
                {today.status !== "done" && today.status !== "rest" && today.status !== "skipped" && h.scheduleKind === "days" ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Not today?</summary>
                    <ActionForm action={skipWithReasonAction.bind(null, h.id, data.today)} submitLabel="Skip" submitVariant="outline" inline submitClassName="h-8 text-xs">
                      <Input name="note" placeholder="What got in the way? (optional)" aria-label={`Reason for skipping ${h.name}`} className="h-8 text-xs" maxLength={500} />
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Consistency</CardTitle>
          <CardDescription>Scheduled days done. Rest days and today (until it&rsquo;s over) don&rsquo;t count against you; doing a habit on another day makes up for a missed one.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Habit</th>
                  <th className="py-1 font-medium">Last 14 days</th>
                  <th className="py-1 text-right font-medium">This week</th>
                  <th className="py-1 text-right font-medium">This month</th>
                  <th className="py-1 text-right font-medium">Streak</th>
                  <th className="py-1 text-right font-medium">Best</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(({ habit: h, recent, week, month, streak }) => (
                  <tr key={h.id} className="border-t">
                    <td className="py-2">
                      <Link href={`/habits/${h.id}`} className="font-medium underline-offset-2 hover:underline">
                        {h.name}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">{scheduleText(h)}</span>
                    </td>
                    <td className="py-2">
                      <span className="flex gap-1">
                        {recent.map((r) => (
                          <DayDot key={r.day} day={r.day} state={r.state} size="sm" />
                        ))}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.expected ? `${week.done}/${week.expected}` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">{pct(month.rate)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {streak.current} {streak.unit === "weeks" ? "wk" : "d"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {streak.best} {streak.unit === "weeks" ? "wk" : "d"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <DayDot day="key" state="done" size="sm" /> done
            </span>
            <span className="flex items-center gap-1">
              <DayDot day="key" state="missed" size="sm" /> missed
            </span>
            <span className="flex items-center gap-1">
              <DayDot day="key" state="rest" size="sm" /> rest
            </span>
            <span className="flex items-center gap-1">
              <DayDot day="key" state="off" size="sm" /> not scheduled
            </span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consistency trend</CardTitle>
            <CardDescription>All habits, last 12 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConsistencyTrendChart data={data.overall} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Habits and productivity</CardTitle>
            <CardDescription>
              Share of the day&rsquo;s top priorities (MITs) completed on days you did a habit vs days you didn&rsquo;t, over the last 90 days. A correlation, not proof that one causes the other.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.correlations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough data yet: each habit needs at least {MIN_CORRELATION_DAYS} days done and {MIN_CORRELATION_DAYS} days not done on days with MITs set ({data.mitDays} days with MITs so far).
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.correlations.map((c) => (
                  <li key={c.habitId} className="flex flex-col gap-0.5">
                    <span>
                      <span className="font-medium">{c.name}</span>:{" "}
                      {c.difference! >= 0 ? "+" : ""}
                      {Math.round(c.difference! * 100)} points
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pct(c.doneAvg)} of priorities done on {c.doneDays} habit days vs {pct(c.otherAvg)} on {c.otherDays} other days
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Missed habit analysis</CardTitle>
          <CardDescription>Last 90 days: where habits slip and what you said got in the way.</CardDescription>
        </CardHeader>
        <CardContent>
          {withMisses.length === 0 ? <p className="text-sm text-muted-foreground">No missed days in the last 90 days.</p> : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {withMisses.slice(0, 6).map(({ habit: h, missed }) => (
              <li key={h.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{h.name}</p>
                <p className="text-xs text-muted-foreground">
                  {h.scheduleKind === "weekly"
                    ? `${missed.missedWeeks.length} week(s) below the target`
                    : `${missed.missedDays.length} missed day(s)${missed.hardestDay != null ? `, most often on ${WEEKDAY_SHORT[missed.hardestDay]}` : ""}`}
                </p>
                {h.scheduleKind === "days" ? (
                  <div className="mt-2 flex items-end gap-1" aria-label="Missed days by weekday">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <span key={d} className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
                        <span className="w-5 rounded-t bg-muted-foreground/40" style={{ height: `${4 + missed.byWeekday[d] * 6}px` }} />
                        {WEEKDAY_SHORT[d][0]}
                        <span className="sr-only">: {missed.byWeekday[d]} missed</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {missed.reasons.length ? (
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {missed.reasons.slice(0, 3).map((r) => (
                      <li key={r.day}>
                        {r.day}: {r.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {withMisses.length > 6 ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">{withMisses.length - 6} more habit(s) with missed days</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {withMisses.slice(6).map(({ habit: h, missed }) => (
                  <li key={h.id}>
                    <Link href={`/habits/${h.id}`} className="underline-offset-2 hover:underline">
                      {h.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {h.scheduleKind === "weekly" ? `${missed.missedWeeks.length} week(s) below target` : `${missed.missedDays.length} missed`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New habit</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ActionForm action={createHabitAction} submitLabel="Add habit">
              <Field label="Habit" htmlFor="nh-name">
                <Input id="nh-name" name="name" required maxLength={120} />
              </Field>
              <ScheduleFields idPrefix="nh" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts" htmlFor="nh-start">
                  <Input id="nh-start" name="startedOn" type="date" defaultValue={data.today} />
                </Field>
              </div>
              <Field label="Description" htmlFor="nh-desc">
                <Textarea id="nh-desc" name="description" rows={2} />
              </Field>
            </ActionForm>
            <form action={addSuggestedAction}>
              <SubmitButton variant="ghost" size="sm">
                Add any missing suggested habits
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rest days</CardTitle>
            <CardDescription>Illness, travel or holidays: every habit is excused. Plan them ahead if you like.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ActionForm action={restDayAction} submitLabel="Add rest day" submitVariant="outline">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day" htmlFor="rd-day">
                  <Input id="rd-day" name="day" type="date" required defaultValue={data.today} />
                </Field>
                <Field label="Reason" htmlFor="rd-reason">
                  <Input id="rd-reason" name="reason" maxLength={200} />
                </Field>
              </div>
            </ActionForm>
            <ul className="flex flex-col gap-1 text-sm">
              {data.restDays.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {r.day}
                    {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
                  </span>
                  <form action={removeRestDayAction.bind(null, r.id)}>
                    <SubmitButton variant="ghost" size="sm" className="h-8 text-xs">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
