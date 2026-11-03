import { Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { PROGRESS_UNIT, RESOURCE_KIND_LABELS, RESOURCE_KINDS, RESOURCE_STATUS_LABELS, RESOURCE_STATUSES, type ResourceKind, type ResourceStatus } from "@/lib/domain/knowledge";
import { cn } from "@/lib/utils";
import { createResourceAction, deleteSessionAction, logSessionAction, setGoalAction } from "../server/actions";
import { loadKnowledge } from "../server/queries";
import { ResourceForm } from "./resource-form";

type Params = Record<string, string | string[] | undefined>;

export async function KnowledgeLibrary({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const kind = RESOURCE_KINDS.find((k) => k === sp.kind);
  const status = RESOURCE_STATUSES.find((s) => s === sp.status);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const data = await loadKnowledge({ kind, status, q });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const { stats, progress, goal } = data;
  const reading = data.resources.filter((r) => r.status === "in_progress");
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");
  const href = (over: { kind?: string | null; status?: string | null }) => {
    const u = new URLSearchParams();
    const k = over.kind === undefined ? kind : over.kind;
    const s = over.status === undefined ? status : over.status;
    if (k) u.set("kind", k);
    if (s) u.set("status", s);
    const str = u.toString();
    return str ? `/knowledge?${str}` : "/knowledge";
  };
  const max7 = Math.max(stats.target ?? 0, ...stats.last7.map((d) => d.minutes), 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-sm text-muted-foreground">What you read, what you learned from it, and where you put it into practice.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&rsquo;s reading</CardTitle>
            <CardDescription>
              {stats.target ? `${stats.todayMinutes} of ${stats.target} min` : `${stats.todayMinutes} min`}
              {stats.target ? ` · ${stats.streak}-day streak` : ""} · read on {stats.daysRead30} of the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="flex h-16 items-end gap-1" aria-label="Minutes read, last 7 days">
              {stats.last7.map((d) => (
                <li key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={cn("w-full rounded-t", stats.target && d.minutes >= stats.target ? "bg-[var(--chart-1)]" : "bg-[var(--chart-1)]/40")}
                    style={{ height: `${Math.max(2, (d.minutes / max7) * 48)}px` }}
                    title={`${d.date}: ${d.minutes} min`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "narrow", timeZone: "UTC" })}
                    <span className="sr-only">: {d.minutes} minutes</span>
                  </span>
                </li>
              ))}
            </ol>
            <ActionForm action={logSessionAction} submitLabel="Log reading" className="gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Minutes" htmlFor="ls-min">
                  <Input id="ls-min" name="minutes" type="number" min="1" max="1440" inputMode="numeric" required defaultValue={stats.target ?? 20} />
                </Field>
                <Field label="Reached page / lesson" htmlFor="ls-to">
                  <Input id="ls-to" name="progressTo" type="number" min="0" inputMode="numeric" />
                </Field>
                <Field label="What" htmlFor="ls-res" className="col-span-2">
                  <Select id="ls-res" name="resourceId" defaultValue={reading[0]?.id ?? ""}>
                    <option value="">Not linked</option>
                    {data.resources
                      .filter((r) => r.status !== "completed" && r.status !== "abandoned")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{data.year} reading goal</CardTitle>
            <CardDescription>
              {progress
                ? `${progress.completed} of ${progress.target} completed · even pace would be ${progress.expectedByToday} by today`
                : "No yearly target set."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {progress ? (
              <>
                <Progress value={progress.pct * 100} aria-label="Reading goal progress" />
                <Badge variant={progress.status === "on_pace" ? "success" : "outline"} className="w-fit">
                  {progress.status === "on_pace" ? "On pace" : "Behind an even pace"}
                </Badge>
              </>
            ) : null}
            <details className="rounded-lg border p-3" open={!goal}>
              <summary className="cursor-pointer text-sm font-medium">{goal ? "Edit goal" : "Set a goal"}</summary>
              <ActionForm action={setGoalAction} submitLabel="Save goal" submitVariant="outline" resetOnSuccess={false} className="mt-3">
                <input type="hidden" name="year" value={data.year} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Complete this year" htmlFor="g-target">
                    <Input id="g-target" name="targetCount" type="number" min="1" inputMode="numeric" defaultValue={goal?.targetCount ?? ""} />
                  </Field>
                  <Field label="Minutes a day" htmlFor="g-daily">
                    <Input id="g-daily" name="dailyMinutes" type="number" min="1" max="1440" inputMode="numeric" defaultValue={goal?.dailyMinutes ?? ""} />
                  </Field>
                </div>
                <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <legend className="mb-1 text-xs font-medium text-muted-foreground">Counts towards the yearly target</legend>
                  {RESOURCE_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" name="kinds" value={k} defaultChecked={(goal?.kinds ?? ["book"]).includes(k)} />
                      {RESOURCE_KIND_LABELS[k]}
                    </label>
                  ))}
                </fieldset>
              </ActionForm>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Knowledge applied</CardTitle>
            <CardDescription>Completed resources with at least one lesson put into practice.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-2xl font-semibold tabular-nums">
              {data.applied.withAppliedLesson} <span className="text-base font-normal text-muted-foreground">of {data.applied.completed}</span>
            </p>
            <p className="text-muted-foreground">{data.practising} practice item(s) in progress.</p>
            {data.recent.length ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium">Recent reading</summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {data.recent.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-muted-foreground">{s.readOn}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {s.minutes} min{s.title ? ` · ${s.title}` : ""}
                      </span>
                      <form action={deleteSessionAction.bind(null, s.id)}>
                        <SubmitButton variant="ghost" size="icon" className="size-7" aria-label={`Delete ${s.minutes} minutes on ${s.readOn}`}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <section aria-labelledby="lib-h" className="flex flex-col gap-3 lg:col-span-2">
          <h2 id="lib-h" className="text-lg font-semibold">
            Library
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ kind: null })} className={chip(!kind)}>
              All types
            </Link>
            {RESOURCE_KINDS.map((k) => (
              <Link key={k} href={href({ kind: k })} className={chip(kind === k)}>
                {RESOURCE_KIND_LABELS[k]}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ status: null })} className={chip(!status)}>
              Any status
            </Link>
            {RESOURCE_STATUSES.map((s) => (
              <Link key={s} href={href({ status: s })} className={chip(status === s)}>
                {RESOURCE_STATUS_LABELS[s]}
              </Link>
            ))}
          </div>
          <form action="/knowledge" className="flex gap-2">
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <Input name="q" defaultValue={q ?? ""} placeholder="Search titles, authors, notes…" aria-label="Search the library" />
          </form>
          {data.filtered.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.filtered.map((r) => {
              const unit = PROGRESS_UNIT[r.kind as ResourceKind];
              return (
                <li key={r.id}>
                  <Link href={`/knowledge/${r.id}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 hover:bg-accent">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {RESOURCE_KIND_LABELS[r.kind as ResourceKind]}
                      {r.category ? ` · ${r.category}` : ""}
                    </span>
                    <span className="font-medium leading-snug">{r.title}</span>
                    {r.author ? <span className="text-sm text-muted-foreground">{r.author}</span> : null}
                    {r.status === "in_progress" && r.totalUnits && unit ? (
                      <Progress value={((r.progressUnits ?? 0) / r.totalUnits) * 100} aria-label={`${r.progressUnits ?? 0} of ${r.totalUnits} ${unit}`} />
                    ) : null}
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant={r.status === "completed" ? "success" : r.status === "in_progress" ? "default" : "outline"}>{RESOURCE_STATUS_LABELS[r.status as ResourceStatus]}</Badge>
                      {r.rating ? <span aria-label={`Rated ${r.rating} of 5`}>{"★".repeat(r.rating)}</span> : null}
                      <span className="text-muted-foreground">
                        {r.concepts} concept(s) · {r.applied}/{r.applications} applied
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a resource</CardTitle>
            </CardHeader>
            <CardContent>
              <ResourceForm action={createResourceAction} submitLabel="Add" today={data.today} categories={data.categories} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
