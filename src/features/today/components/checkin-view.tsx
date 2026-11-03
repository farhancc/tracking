import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form-controls";
import { logSessionAction } from "@/features/knowledge/server/actions";
import { cn } from "@/lib/utils";
import { checkInHabitAction, finishTaskAction, quickAddTaskAction, reopenTaskAction } from "../server/actions";
import { loadCheckin } from "../server/queries";

/**
 * The fast daily check-in: everything needs one tap or one short field, and
 * each control is a plain Server Action form, so it works before JavaScript
 * loads and retries automatically after a dropped connection.
 */
export async function CheckinView() {
  const data = await loadCheckin();
  if (!data.ready) {
    return (
      <Card>
        <CardContent className="py-6 text-sm">
          Set up your five-year journey on{" "}
          <Link href="/today" className="underline">
            Today
          </Link>{" "}
          first.
        </CardContent>
      </Card>
    );
  }
  const d = data.day;
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const setMits = data.mits.filter((m) => m.task);
  const others = data.tasks.filter((t) => !(t.mitOn === d && t.mitRank) && t.status !== "cancelled");
  const SHOWN = 8;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Check-in</h1>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-2xl font-semibold tabular-nums">{data.progress.pct === null ? "–" : `${data.progress.pct}%`}</span>
          <span className="text-xs text-muted-foreground">today</span>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top priorities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {setMits.length === 0 ? (
            <Link href="/today" className="flex min-h-11 items-center justify-between rounded-md border px-3 text-sm hover:bg-accent">
              Pick today&apos;s three most important tasks <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <ul className="flex flex-col gap-2">
              {setMits.map(({ rank, task }) => {
                const t = task!;
                const done = t.status === "done";
                return (
                  <li key={rank} className="min-w-0">
                    <form action={(done ? reopenTaskAction : finishTaskAction).bind(null, t.id)}>
                      <SubmitButton
                        variant="outline"
                        className={cn("h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left", done && "border-success bg-success/10")}
                        aria-pressed={done}
                        aria-label={`${t.title}: ${done ? "done, tap to reopen" : "tap when done"}`}
                      >
                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", done && "border-success bg-success text-white")}>
                          {done ? <Check className="size-4" aria-hidden /> : <span className="text-xs">{rank}</span>}
                        </span>
                        <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>{t.title}</span>
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {others.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Other tasks today
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {others.filter((t) => t.status === "done").length}/{others.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <ul className="flex flex-col divide-y">
              {others.slice(0, SHOWN).map((t) => {
                const done = t.status === "done";
                return (
                  <li key={t.id} className="min-w-0">
                    <form action={(done ? reopenTaskAction : finishTaskAction).bind(null, t.id)}>
                      <button
                        type="submit"
                        className="flex min-h-12 w-full min-w-0 items-center gap-3 py-1 text-left text-sm"
                        aria-pressed={done}
                        aria-label={`${t.title}: ${done ? "done, tap to reopen" : "tap when done"}`}
                      >
                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", done && "border-success bg-success text-white")}>
                          {done ? <Check className="size-4" aria-hidden /> : null}
                        </span>
                        <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>{t.title}</span>
                        {t.dueOn === d && !done ? <span className="shrink-0 text-xs text-destructive">due today</span> : null}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
            {others.length > SHOWN ? (
              <Link href="/today" className="text-sm underline">
                {others.length - SHOWN} more on Today
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
        <CardContent>
          {data.habits.length === 0 ? <p className="text-sm text-muted-foreground">No habits scheduled today.</p> : null}
          <ul className="flex flex-col gap-2">
            {data.habits.map((hb) => (
              <li key={hb.id} className="flex min-w-0 items-center gap-2">
                <form action={checkInHabitAction.bind(null, d, hb.id, hb.status === "done" ? null : "done")} className="min-w-0 flex-1">
                  <SubmitButton
                    variant="outline"
                    className={cn("h-12 w-full justify-start gap-3 px-3 text-left", hb.status === "done" && "border-success bg-success/10", hb.status && hb.status !== "done" && "text-muted-foreground")}
                    aria-pressed={hb.status === "done"}
                    aria-label={`${hb.name}: ${hb.status === "done" ? "done, tap to undo" : "tap when done"}`}
                  >
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", hb.status === "done" && "border-success bg-success text-white")}>
                      {hb.status === "done" ? <Check className="size-4" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 truncate">{hb.name}</span>
                    {hb.status === "skipped" ? <span className="ml-auto shrink-0 text-xs">skipped</span> : null}
                    {hb.status === "rest" ? <span className="ml-auto shrink-0 text-xs">rest</span> : null}
                  </SubmitButton>
                </form>
                {hb.status !== "done" ? (
                  <form action={checkInHabitAction.bind(null, d, hb.id, hb.status === "skipped" ? null : "skipped")}>
                    <SubmitButton variant="ghost" className="h-12 px-2 text-xs" aria-label={hb.status === "skipped" ? `Undo skip for ${hb.name}` : `Skip ${hb.name} today`}>
                      {hb.status === "skipped" ? "Undo" : "Skip"}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick capture</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActionForm action={quickAddTaskAction.bind(null, d, null)} submitLabel="Add" inline>
            <Label htmlFor="checkin-task" className="sr-only">
              Task for today
            </Label>
            <Input id="checkin-task" name="title" placeholder="Task for today" required maxLength={200} className="min-w-0 flex-1" enterKeyHint="done" />
          </ActionForm>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Read today: <span className="font-medium text-foreground tabular-nums">{data.readingMinutes} min</span>
          </p>
          <ActionForm action={logSessionAction} submitLabel="Log reading" inline>
            <Label htmlFor="checkin-reading" className="sr-only">
              Minutes read today
            </Label>
            <Input id="checkin-reading" name="minutes" type="number" inputMode="numeric" min={1} max={1440} placeholder="Minutes read" required className="min-w-0 flex-1" />
          </ActionForm>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
        <Link href="/today" className="flex min-h-11 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent">
          Full day plan
        </Link>
        <Link href="/today#accomplished" className="flex min-h-11 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent">
          Evening reflection
        </Link>
      </div>
    </div>
  );
}
