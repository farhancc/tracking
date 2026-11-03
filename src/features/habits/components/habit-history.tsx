import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { WEEKDAY_SHORT } from "@/lib/domain/habits";
import { archiveHabitAction, deleteHabitAction, updateHabitAction } from "../server/actions";
import { loadHabit } from "../server/queries";
import { DayDot } from "./day-dot";
import { ScheduleFields } from "./schedule-fields";

export async function HabitHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadHabit(id).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const h = data.habit;
  const firstWeek = data.weeks[0]?.days ?? [];
  return (
    <div className="flex flex-col gap-6">
      <Link href="/habits" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Habits
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
        {h.description ? <p className="text-sm text-muted-foreground">{h.description}</p> : null}
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Times done", String(data.totalDone), `since ${h.startedOn}`],
          ["All-time consistency", data.allTime.rate == null ? "—" : `${Math.round(data.allTime.rate * 100)}%`, `${data.allTime.done} of ${data.allTime.expected}`],
          ["Current streak", `${data.streak.current} ${data.streak.unit}`, "rest days don't break it"],
          ["Best streak", `${data.streak.best} ${data.streak.unit}`, ""],
        ].map(([k, v, hint]) => (
          <div key={k} className="rounded-xl border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
            <dd className="text-[11px] text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
          <CardDescription>Each column is a week, up to a year back.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <div className="flex shrink-0 flex-col gap-1 pt-0.5 text-[10px] text-muted-foreground" aria-hidden>
              {firstWeek.map((d) => (
                <span key={d.day} className="h-3 leading-3">
                  {WEEKDAY_SHORT[new Date(`${d.day}T00:00:00Z`).getUTCDay()][0]}
                </span>
              ))}
            </div>
            {data.weeks.map((w) => (
              <div key={w.weekStart} className="flex shrink-0 flex-col gap-1">
                {w.days.map((d) => (
                  <DayDot key={d.day} day={d.day} state={d.state} size="sm" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet. Add a reason when you skip a day.</p> : null}
            <ul className="flex flex-col gap-1 text-sm">
              {data.notes.map((n) => (
                <li key={n.day}>
                  <span className="text-muted-foreground">
                    {n.day} · {n.status}:
                  </span>{" "}
                  {n.note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ActionForm action={updateHabitAction.bind(null, h.id)} submitLabel="Save" resetOnSuccess={false}>
              <Field label="Habit" htmlFor="eh-name">
                <Input id="eh-name" name="name" required maxLength={120} defaultValue={h.name} />
              </Field>
              <ScheduleFields idPrefix="eh" kind={h.scheduleKind} days={h.scheduleDays} weeklyTarget={h.weeklyTarget} />
              <Field label="Started" htmlFor="eh-start" hint="Days before this aren't counted">
                <Input id="eh-start" name="startedOn" type="date" defaultValue={h.startedOn} />
              </Field>
              <Field label="Description" htmlFor="eh-desc">
                <Textarea id="eh-desc" name="description" rows={2} defaultValue={h.description ?? ""} />
              </Field>
            </ActionForm>
            <div className="flex flex-wrap items-start gap-3 border-t pt-3">
              <form action={archiveHabitAction.bind(null, h.id)}>
                <SubmitButton variant="outline" size="sm">
                  Archive (keep history)
                </SubmitButton>
              </form>
              <ActionForm action={deleteHabitAction.bind(null, h.id)} submitLabel="Delete for good" submitVariant="destructive" className="gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="confirm" /> Also delete all {data.totalDone} check-ins
                </label>
              </ActionForm>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
