import { Check, ChevronRight, Clock, Play, RotateCcw, Square, X } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { MIT_LABELS, WEEKDAY_LABELS, type MitRank } from "@/lib/domain/daily";
import { formatMinutes } from "@/lib/domain/weekly";
import { cn } from "@/lib/utils";
import {
  carryOverdueAction,
  checkInHabitAction,
  clearMitAction,
  createHabitAction,
  finishTaskAction,
  quickAddTaskAction,
  reopenTaskAction,
  saveAvailableTimeAction,
  saveReflectionAction,
  scheduleTodayAction,
  setMitAction,
  startTaskAction,
  unscheduleAction,
} from "../server/actions";
import { loadToday } from "../server/queries";
import type { TodayDetail } from "../server/service";

type TaskItem = TodayDetail["tasks"][number];

function clock(d: Date | null, tz: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

function ProgressRing({ pct }: { pct: number | null }) {
  const value = pct ?? 0;
  return (
    <div
      className="relative grid size-20 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--success) ${value * 3.6}deg, var(--muted) 0deg)` }}
      role="img"
      aria-label={pct === null ? "No progress yet: nothing planned" : `Daily progress ${value}%`}
    >
      <div className="grid size-16 place-items-center rounded-full bg-card">
        <span className="text-lg font-semibold tabular-nums">{pct === null ? "–" : `${value}%`}</span>
      </div>
    </div>
  );
}

/** One task row with a large check target and Start / Finish controls. */
function TaskLine({ task, tz, big = false }: { task: TaskItem; tz: string; big?: boolean }) {
  const done = task.status === "done";
  const doing = task.status === "doing";
  return (
    <div className={cn("flex items-start gap-3", big ? "py-1" : "py-2.5")}>
      <form action={(done ? reopenTaskAction : finishTaskAction).bind(null, task.id)}>
        <SubmitButton
          variant="outline"
          className={cn("size-11 shrink-0 rounded-full p-0", done && "border-success bg-success text-white hover:bg-success/90")}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        >
          {done ? <Check className="size-5" aria-hidden /> : null}
        </SubmitButton>
      </form>
      <div className="min-w-0 flex-1">
        <p className={cn(big ? "text-base font-medium" : "text-sm", done && "text-muted-foreground line-through")}>{task.title}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {task.scheduledStart ? <span>{task.scheduledStart.slice(0, 5)}</span> : null}
          {task.estimatedMinutes ? <span>est. {formatMinutes(task.estimatedMinutes)}</span> : null}
          {task.actualMinutes ? <span>actual {formatMinutes(task.actualMinutes)}</span> : null}
          {task.startedAt ? <span>started {clock(task.startedAt, tz)}</span> : null}
          {task.finishedAt ? <span>finished {clock(task.finishedAt, tz)}</span> : null}
          {task.goalTitle ? <span className="truncate">→ {task.goalTitle}</span> : null}
          {task.isDeliverable ? <span className="text-success">deliverable</span> : null}
        </p>
      </div>
      {!done ? (
        <form action={(doing ? finishTaskAction : startTaskAction).bind(null, task.id)}>
          <SubmitButton
            variant={doing ? "default" : "outline"}
            className="h-11 min-w-20 px-3"
            aria-label={doing ? `Finish ${task.title}` : `Start ${task.title}`}
          >
            {doing ? <Square aria-hidden /> : <Play aria-hidden />}
            {doing ? "Finish" : "Start"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export async function TodayView({ day }: { day?: string }) {
  const data = await loadToday(day);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const tz = data.workspace.profile?.timezone ?? "UTC";
  const d = data.day;
  const [y, m, dd] = d.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, dd)),
  );
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date()));
  const reflectionOpen = !data.isToday || hour >= 17 || Boolean(data.plan?.reflectedAt);

  const mitIds = new Set(data.mits.map((s) => s.task?.id).filter(Boolean));
  const execution = data.tasks.filter((t) => !mitIds.has(t.id));
  const pickable = [...data.tasks.filter((t) => !mitIds.has(t.id) && t.status !== "done" && t.status !== "cancelled"), ...data.candidates];
  const over = data.availableMinutes !== null && data.openMinutes > data.availableMinutes;
  const annual = data.annualObjectives[0];
  const quarter = data.quarterlyObjectives[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-28">
      {/* Header: date, journey day, progress */}
      <section className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{dateLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {data.journey.started
              ? `Day ${data.journey.day.toLocaleString("en")} of ${data.journey.total.toLocaleString("en")} · Year ${data.journey.year}`
              : `Journey starts in ${Math.abs(data.journey.day)} days`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.availableMinutes !== null
              ? `${formatMinutes(data.openMinutes)} of work left · ${formatMinutes(data.availableMinutes)} available`
              : `${formatMinutes(data.plannedMinutes)} planned · set your available time below`}
            {over ? <span className="text-warning"> · over by {formatMinutes(data.openMinutes - (data.availableMinutes ?? 0))}</span> : null}
          </p>
        </div>
        <ProgressRing pct={data.progress.pct} />
      </section>

      {/* Direction */}
      <section aria-label="Direction" className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-sm">
        <DirectionLine label="Year" goal={annual} more={data.annualObjectives.length - 1} />
        <DirectionLine label="Quarter" goal={quarter} more={data.quarterlyObjectives.length - 1} />
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Week</span>
          {data.weekPriorities.length ? (
            <ul className="min-w-0 flex-1">
              {data.weekPriorities.slice(0, 4).map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  <Link href={`/goals/${g.id}`} className="truncate hover:underline">
                    {g.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{g.completionPct}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/week" className="text-muted-foreground underline-offset-2 hover:underline">
              No weekly goals yet. Plan the week →
            </Link>
          )}
        </div>
      </section>

      {/* Today's mission */}
      <section aria-labelledby="mission" className="flex flex-col gap-3">
        <h2 id="mission" className="text-lg font-semibold">
          Today&apos;s mission
        </h2>
        {data.mits.map(({ rank, task }) => (
          <div key={rank} className={cn("rounded-xl border bg-card p-3", task?.status === "done" && "border-success/40 bg-success/5")}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {rank}. {MIT_LABELS[rank as MitRank]}
              </span>
              {task ? (
                <form action={clearMitAction.bind(null, d, rank)}>
                  <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Remove ${task.title} from the mission`}>
                    <X aria-hidden />
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            {task ? (
              <TaskLine task={task} tz={tz} big />
            ) : (
              <div className="flex flex-col gap-2">
                {pickable.length > 0 ? (
                  <ActionForm action={setMitAction.bind(null, d, rank)} submitLabel="Set" submitVariant="outline" inline className="items-center gap-2" submitClassName="h-11">
                    <Select name="taskId" defaultValue="" aria-label={`Choose task for slot ${rank}`} className="h-11">
                      <option value="" disabled>
                        Pick from today or this week…
                      </option>
                      {pickable.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </Select>
                  </ActionForm>
                ) : null}
                <ActionForm action={quickAddTaskAction.bind(null, d, rank)} submitLabel="Add" inline className="items-center gap-2" submitClassName="h-11">
                  <Input name="title" placeholder="Or type a new one" aria-label={`New task for slot ${rank}`} className="h-11" required maxLength={300} />
                  <Input name="estimatedMinutes" placeholder="1h" aria-label="Estimate" className="h-11 w-16" />
                </ActionForm>
              </div>
            )}
          </div>
        ))}
      </section>

      {data.overdue.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-warning/50 bg-warning/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Overdue ({data.overdue.length})</h2>
            <form action={carryOverdueAction.bind(null, d)}>
              <SubmitButton size="sm" variant="outline" className="h-9">
                Move all to today
              </SubmitButton>
            </form>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {data.overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.scheduledOn}</span>
                <form action={scheduleTodayAction.bind(null, d, t.id)}>
                  <SubmitButton size="sm" variant="ghost" className="h-9">
                    Today
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.scheduled.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" aria-hidden /> Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1.5 text-sm">
              {data.scheduled.map((t) => (
                <li key={t.id} className="flex gap-3">
                  <span className="w-12 shrink-0 font-medium tabular-nums">{t.scheduledStart?.slice(0, 5)}</span>
                  <span className={cn("min-w-0 flex-1", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                  {t.estimatedMinutes ? <span className="text-xs text-muted-foreground">{formatMinutes(t.estimatedMinutes)}</span> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* Daily execution */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">Daily execution</CardTitle>
        </CardHeader>
        <CardContent>
          {execution.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing else planned. Add tasks with the bar below, or pull them from this week.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {execution.map((t) => (
                <div key={t.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <TaskLine task={t} tz={tz} />
                  </div>
                  <form action={unscheduleAction.bind(null, t.id)}>
                    <SubmitButton variant="ghost" size="icon" className="size-9" aria-label={`Remove ${t.title} from today`}>
                      <RotateCcw className="size-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
          {data.candidates.length > 0 ? (
            <details className="mt-3 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Pull from this week ({data.candidates.length})</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.candidates.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {t.title}
                      {t.goalTitle ? <span className="text-xs text-muted-foreground"> · {t.goalTitle}</span> : null}
                    </span>
                    <form action={scheduleTodayAction.bind(null, d, t.id)}>
                      <SubmitButton size="sm" variant="outline" className="h-9">
                        Do today
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      {/* Habits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Habits
            {data.habits.length ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.progress.habits.done}/{data.habits.length}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.habits.length === 0 ? <p className="text-sm text-muted-foreground">No habits scheduled today.</p> : null}
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.habits.map((hb) => (
              <li key={hb.id} className="flex items-center gap-2">
                <form action={checkInHabitAction.bind(null, d, hb.id, hb.status === "done" ? null : "done")} className="min-w-0 flex-1">
                  <SubmitButton
                    variant="outline"
                    className={cn(
                      "h-12 w-full justify-start gap-3 px-3 text-left",
                      hb.status === "done" && "border-success bg-success/10",
                      hb.status === "skipped" && "text-muted-foreground",
                    )}
                    aria-pressed={hb.status === "done"}
                    aria-label={`${hb.name}: ${hb.status === "done" ? "done, tap to undo" : "tap when done"}`}
                  >
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", hb.status === "done" && "border-success bg-success text-white")}>
                      {hb.status === "done" ? <Check className="size-4" aria-hidden /> : null}
                    </span>
                    <span className="truncate">{hb.name}</span>
                    {hb.status === "skipped" ? <Badge variant="outline">Rest</Badge> : null}
                  </SubmitButton>
                </form>
                <form action={checkInHabitAction.bind(null, d, hb.id, hb.status === "skipped" ? null : "skipped")}>
                  <SubmitButton variant="ghost" className="h-12 px-2 text-xs" aria-label={hb.status === "skipped" ? `Undo rest day for ${hb.name}` : `Rest day for ${hb.name}`}>
                    {hb.status === "skipped" ? "Undo" : "Rest"}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add habit</summary>
            <ActionForm action={createHabitAction} submitLabel="Add habit" submitVariant="outline" className="mt-3">
              <Field label="Habit" htmlFor="habit-name">
                <Input id="habit-name" name="name" required maxLength={120} placeholder="e.g. Practice a 2-minute speech" />
              </Field>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1 text-sm font-medium">Days</legend>
                {WEEKDAY_LABELS.map((label, i) => (
                  <label key={label} className="flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm">
                    <input type="checkbox" name="days" value={i} defaultChecked className="size-4" /> {label}
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          </details>
        </CardContent>
      </Card>

      {/* Available time */}
      <Card>
        <CardContent className="pt-5">
          <ActionForm action={saveAvailableTimeAction.bind(null, d)} submitLabel="Save" submitVariant="outline" resetOnSuccess={false} inline className="items-end gap-2" submitClassName="h-11">
            <Field label="Time available today" htmlFor="available" className="flex-1">
              <Input
                id="available"
                name="available"
                placeholder="e.g. 3h 30m"
                defaultValue={data.availableMinutes !== null ? formatMinutes(data.availableMinutes).replace(/ /g, "") : ""}
                className="h-11"
              />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      {/* Reflection */}
      <details open={reflectionOpen} className="group rounded-xl border bg-card p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
          Daily reflection
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <ActionForm action={saveReflectionAction.bind(null, d)} submitLabel="Save reflection" resetOnSuccess={false} className="mt-3">
          <Field label="What did I accomplish?" htmlFor="accomplished">
            <Textarea id="accomplished" name="accomplished" rows={2} defaultValue={data.plan?.accomplished ?? ""} />
          </Field>
          <Field label="What did I learn?" htmlFor="learned">
            <Textarea id="learned" name="learned" rows={2} defaultValue={data.plan?.learned ?? ""} />
          </Field>
          <Field label="What went wrong?" htmlFor="wentWrong">
            <Textarea id="wentWrong" name="wentWrong" rows={2} defaultValue={data.plan?.wentWrong ?? ""} />
          </Field>
          <Field label="What should I improve tomorrow?" htmlFor="improveTomorrow">
            <Textarea id="improveTomorrow" name="improveTomorrow" rows={2} defaultValue={data.plan?.improveTomorrow ?? ""} />
          </Field>
        </ActionForm>
      </details>

      {/* One-handed quick add, anchored to the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <ActionForm action={quickAddTaskAction.bind(null, d, null)} submitLabel="Add" inline className="items-center gap-2" submitClassName="h-12 px-5">
            <Input name="title" placeholder="Add a task for today…" aria-label="New task for today" className="h-12 text-base" required maxLength={300} />
            <Input name="estimatedMinutes" placeholder="30m" aria-label="Estimate" className="h-12 w-20 text-base" />
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

function DirectionLine({ label, goal, more }: { label: string; goal?: TodayDetail["annualObjectives"][number]; more: number }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {goal ? (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Link href={`/goals/${goal.id}`} className="truncate hover:underline">
            {goal.title}
          </Link>
          <span className="shrink-0 text-xs text-muted-foreground">
            {goal.completionPct}%{more > 0 ? ` · +${more}` : ""}
          </span>
        </span>
      ) : (
        <Link href="/roadmap" className="text-muted-foreground underline-offset-2 hover:underline">
          No {label.toLowerCase()} objective. Set one in the roadmap →
        </Link>
      )}
    </div>
  );
}
