import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { cn } from "@/lib/utils";
import { loadCommunication } from "../server/queries";
import { PracticeForm } from "./practice-form";

export async function CommunicationOverview() {
  const data = await loadCommunication();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const { summary } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Communication mastery</h1>
          <p className="text-sm text-muted-foreground">
            Today: {summary.dailyDone}/{summary.dailyTotal} daily exercises · {summary.assessedThisMonth}/{data.skills.length} skills assessed this month
            {summary.assessmentsDue ? ` · ${summary.assessmentsDue} assessments due` : ""}
          </p>
        </div>
        <Link href="/communication/assess" className={buttonVariants()}>
          Monthly assessment
        </Link>
      </div>
      <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
        Levels come only from assessments. Exercises build your practice history but never raise a level on their own: assess
        each skill at least monthly, ideally from a recording or with a mentor.
      </p>

      <section aria-labelledby="daily" className="flex flex-col gap-3">
        <h2 id="daily" className="text-lg font-semibold">
          Today&apos;s exercises
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.dailyExercises.map((e) => (
            <Card key={e.id} className={cn(e.doneToday && "border-success/50 bg-success/5")}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {e.doneToday ? (
                    <span className="grid size-6 place-items-center rounded-full bg-success text-white" aria-label="Done today">
                      <Check className="size-4" aria-hidden />
                    </span>
                  ) : null}
                  <CardTitle className="text-base">{e.title}</CardTitle>
                </div>
                <CardDescription>
                  {e.instructions} {e.skillName ? <span className="block text-xs">Trains: {e.skillName}</span> : null}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{e.doneToday ? "Log again" : "Log practice"}</summary>
                  <div className="mt-3">
                    <PracticeForm exerciseId={e.id} wantsRecording={e.wantsRecording} wantsWords={e.wantsWords} today={data.day} idPrefix={`d-${e.key ?? e.id.slice(0, 6)}`} />
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="skills" className="flex flex-col gap-3">
        <h2 id="skills" className="text-lg font-semibold">
          Skills
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.skills.map((s) => (
            <li key={s.id}>
              <Link href={`/communication/${s.key}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:bg-accent">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.status.currentLevel !== null ? (
                    <span className="text-lg font-semibold tabular-nums">
                      {s.status.currentLevel}
                      <span className="text-xs font-normal text-muted-foreground">/10</span>
                    </span>
                  ) : (
                    <Badge variant="outline">Not assessed</Badge>
                  )}
                </div>
                <div className="relative h-2 rounded-full bg-muted" role="img" aria-label={`Level ${s.status.currentLevel ?? "not assessed"} of target ${s.targetLevel}`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${((s.status.currentLevel ?? 0) / 10) * 100}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-success" style={{ left: `${s.targetLevel * 10}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Target {s.targetLevel} · {s.status.sessionsLast30} practice sessions in 30 days
                  {s.status.change !== null && s.status.change !== 0 ? ` · ${s.status.change > 0 ? "+" : ""}${s.status.change} since first assessment` : ""}
                </p>
                {s.status.needsAssessment ? (
                  <span className="inline-flex items-center gap-1 text-xs text-warning-ink">
                    <CircleAlert className="size-3" aria-hidden />
                    {s.status.lastAssessedOn ? `Assessment due (last ${s.status.lastAssessedOn})` : "Practised but never assessed"}
                  </span>
                ) : s.status.lastAssessedOn ? (
                  <span className="text-xs text-muted-foreground">Assessed {s.status.lastAssessedOn}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
