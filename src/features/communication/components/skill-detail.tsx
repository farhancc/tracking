import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ASSESSMENT_METHOD_LABELS, ASSESSMENT_METHODS, LEVEL_DESCRIPTORS, RESOURCE_KINDS, type AssessmentMethod } from "@/lib/domain/communication";
import { addAssessmentAction, addExerciseAction, addResourceAction, deletePracticeAction, deleteResourceAction, updateSkillTargetAction } from "../server/actions";
import { loadSkill } from "../server/queries";
import { LevelChart } from "./level-chart";
import { PracticeForm } from "./practice-form";
import { RecordingField } from "./recording-field";

const audioSrc = (id: string) => `/api/v1/communication/recordings/${id}`;

export async function SkillDetail({ params }: { params: Promise<{ skill: string }> }) {
  const { skill: key } = await params;
  if (!/^[a-z_]{2,40}$/.test(key)) notFound();
  const data = await loadSkill(key).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const { skill, status, assessments, sessions, exercises, resources, today } = data;
  const chart = [...assessments].reverse().map((a) => ({ date: a.assessedOn, level: a.level }));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/communication" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Communication
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {status.currentLevel !== null ? (
              <Badge>
                Level {status.currentLevel}/10 · {LEVEL_DESCRIPTORS[status.currentLevel]}
              </Badge>
            ) : (
              <Badge variant="outline">Not assessed yet</Badge>
            )}
            {status.assessmentDue ? <Badge variant="warning">Assessment due</Badge> : null}
            <Badge variant="outline">{status.sessionsLast30} sessions · {status.minutesLast30} min in 30 days</Badge>
          </div>
        </div>
        <ActionForm action={updateSkillTargetAction.bind(null, skill.id)} submitLabel="Set target" submitVariant="outline" inline resetOnSuccess={false} submitClassName="h-9">
          <label htmlFor="targetLevel" className="text-sm">
            Target level
          </label>
          <Select id="targetLevel" name="targetLevel" defaultValue={String(skill.targetLevel)} className="w-20" key={skill.targetLevel}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </ActionForm>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Assessed level over time</CardTitle>
              <CardDescription>
                {assessments.length
                  ? `${assessments.length} assessment${assessments.length === 1 ? "" : "s"}${status.change !== null ? `, ${status.change >= 0 ? "+" : ""}${status.change} since the first` : ""}.`
                  : "No assessments yet. Your first assessment sets the baseline."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LevelChart points={chart} target={skill.targetLevel} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log practice</CardTitle>
            </CardHeader>
            <CardContent>
              <PracticeForm skillId={skill.id} exercises={exercises.map((e) => ({ id: e.id, title: e.title }))} wantsWords={skill.key === "vocabulary"} today={today} idPrefix="sp" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Practice history</CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? <p className="text-sm text-muted-foreground">No practice yet.</p> : null}
              <ul className="flex flex-col divide-y">
                {sessions.map(({ session: s, exerciseTitle }) => (
                  <li key={s.id} className="flex flex-col gap-1.5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{s.practicedOn}</span>
                      <span className="text-muted-foreground">
                        {exerciseTitle ?? "Free practice"}
                        {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                        {s.selfRating ? ` · went ${s.selfRating}/5` : ""}
                      </span>
                      <form className="ml-auto" action={deletePracticeAction.bind(null, s.id)}>
                        <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete practice of ${s.practicedOn}`}>
                          <Trash2 className="size-4" aria-hidden />
                        </SubmitButton>
                      </form>
                    </div>
                    {s.words.length ? <p className="text-xs">Words: {s.words.join(", ")}</p> : null}
                    {s.content ? <p className="whitespace-pre-wrap text-sm">{s.content}</p> : null}
                    {s.notes ? <p className="text-xs text-muted-foreground">Improve: {s.notes}</p> : null}
                    {s.recordingId ? <audio controls preload="none" src={audioSrc(s.recordingId)} className="w-full" /> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assess this skill</CardTitle>
              <CardDescription>Rate against real evidence: a recording, a role-play score, a mentor&apos;s feedback.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={addAssessmentAction.bind(null, skill.id)} submitLabel="Save assessment">
                <Field label="Level (1–10)" htmlFor="a-level">
                  <Select id="a-level" name="level" defaultValue={String(status.currentLevel ?? 5)}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}: {LEVEL_DESCRIPTORS[n]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Method" htmlFor="a-method">
                  <Select id="a-method" name="method" defaultValue="recording_review">
                    {ASSESSMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {ASSESSMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assessor (if not you)" htmlFor="a-assessor">
                  <Input id="a-assessor" name="assessor" maxLength={200} />
                </Field>
                <Field label="Evidence" htmlFor="a-evidence" hint="What you observed that justifies the level.">
                  <Textarea id="a-evidence" name="evidence" rows={3} required minLength={3} />
                </Field>
                <RecordingField label="Evidence recording (optional)" />
                <Field label="Date" htmlFor="a-date">
                  <Input id="a-date" name="assessedOn" type="date" max={today} defaultValue={today} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence of improvement</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {assessments.length === 0 ? <p className="text-sm text-muted-foreground">Assessments and their evidence appear here.</p> : null}
              {assessments.map((a) => (
                <div key={a.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge>{a.level}/10</Badge>
                    <span className="text-xs text-muted-foreground">
                      {a.assessedOn} · {ASSESSMENT_METHOD_LABELS[a.method as AssessmentMethod]}
                      {a.assessor ? ` · ${a.assessor}` : ""}
                    </span>
                  </div>
                  <p>{a.evidence}</p>
                  {a.recordingId ? <audio controls preload="none" src={audioSrc(a.recordingId)} className="w-full" /> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exercises</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {exercises.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium">{e.title}</span>
                    {e.isDaily ? <Badge variant="outline" className="ml-2">Daily</Badge> : null}
                    {e.instructions ? <p className="text-xs text-muted-foreground">{e.instructions}</p> : null}
                  </li>
                ))}
              </ul>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add exercise</summary>
                <ActionForm action={addExerciseAction.bind(null, skill.id)} submitLabel="Add exercise" submitVariant="outline" className="mt-3">
                  <Field label="Exercise" htmlFor="e-title">
                    <Input id="e-title" name="title" required maxLength={200} />
                  </Field>
                  <Field label="Instructions" htmlFor="e-ins">
                    <Textarea id="e-ins" name="instructions" rows={2} />
                  </Field>
                  <Field label="Minutes" htmlFor="e-min">
                    <Input id="e-min" name="durationMinutes" type="number" min={1} max={240} />
                  </Field>
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning resources</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {resources.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
                          {r.title}
                        </a>
                      ) : (
                        <span className="font-medium">{r.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground"> · {r.kind}</span>
                      {r.notes ? <p className="text-xs text-muted-foreground">{r.notes}</p> : null}
                    </div>
                    <form action={deleteResourceAction.bind(null, r.id)}>
                      <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Remove ${r.title}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add resource</summary>
                <ActionForm action={addResourceAction.bind(null, skill.id)} submitLabel="Add resource" submitVariant="outline" className="mt-3">
                  <Field label="Title" htmlFor="r-title">
                    <Input id="r-title" name="title" required maxLength={300} />
                  </Field>
                  <Field label="Type" htmlFor="r-kind">
                    <Select id="r-kind" name="kind" defaultValue="book">
                      {RESOURCE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Link" htmlFor="r-url">
                    <Input id="r-url" name="url" type="url" placeholder="https://" />
                  </Field>
                </ActionForm>
              </details>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
