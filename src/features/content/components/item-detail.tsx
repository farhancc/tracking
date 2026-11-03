import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  FORMAT_LABELS,
  FORMATS_BY_PLATFORM,
  isPublished,
  METRIC_FIELDS,
  METRIC_LABELS,
  METRICS_BY_PLATFORM,
  nextStatus,
  PERCENT_FIELDS,
  PLATFORM_EXTRA_METRICS,
  PLATFORM_LABELS,
  PLATFORMS,
  statusIndex,
  engagement,
} from "@/lib/domain/content";
import { cn } from "@/lib/utils";
import { addSourceAction, advanceItemAction, archiveItemAction, deleteMetricsAction, deleteSourceAction, recordMetricsAction, repurposeAction, updateItemAction } from "../server/actions";
import { loadItem } from "../server/queries";

const fmtNum = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("en").format(n));

function FormatSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <Select id={id} name="format" defaultValue={defaultValue}>
      <option value="">Not decided</option>
      {PLATFORMS.map((p) => (
        <optgroup key={p} label={PLATFORM_LABELS[p]}>
          {FORMATS_BY_PLATFORM[p].map((f) => (
            <option key={`${p}-${f}`} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadItem(id).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const { item: i, today } = data;
  const next = nextStatus(i.status);
  const pillar = data.pillars.find((p) => p.id === i.pillarId);
  const fields = i.platform ? METRICS_BY_PLATFORM[i.platform] : METRIC_FIELDS;
  const v = (k: keyof typeof i) => (i[k] as string | null) ?? "";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/content" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Content
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{i.title}</h1>
          {i.platform ? <Badge variant="outline">{PLATFORM_LABELS[i.platform]}</Badge> : null}
          {i.format ? <Badge variant="outline">{FORMAT_LABELS[i.format]}</Badge> : null}
          {pillar ? <Badge variant="secondary">{pillar.name}</Badge> : null}
        </div>
        <ol aria-label="Pipeline" className="flex flex-wrap gap-1 text-[11px]">
          {CONTENT_STATUSES.map((s) => (
            <li
              key={s}
              aria-current={s === i.status ? "step" : undefined}
              className={cn(
                "rounded-full border px-2 py-0.5",
                statusIndex(s) < statusIndex(i.status) && "border-transparent bg-muted text-muted-foreground",
                s === i.status && "border-primary bg-primary text-primary-foreground",
                statusIndex(s) > statusIndex(i.status) && "text-muted-foreground",
              )}
            >
              {CONTENT_STATUS_LABELS[s]}
            </li>
          ))}
        </ol>
        {next && next !== "scheduled" && next !== "reviewed" ? (
          <div className="max-w-md">
            <ActionForm action={advanceItemAction.bind(null, i.id)} submitLabel={`Move to ${CONTENT_STATUS_LABELS[next]}`} inline>
              {null}
            </ActionForm>
          </div>
        ) : null}
        {next === "scheduled" ? <p className="text-sm text-muted-foreground">Set the scheduled date and status below to schedule it.</p> : null}
        {i.status === "published" ? <p className="text-sm text-muted-foreground">Record metrics, then close the performance review with what you learned.</p> : null}
        {data.original ? (
          <p className="text-sm text-muted-foreground">
            Repurposed from{" "}
            <Link className="underline-offset-2 hover:underline" href={`/content/${data.original.id}`}>
              {data.original.title}
            </Link>
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateItemAction.bind(null, i.id)} submitLabel="Save" resetOnSuccess={false}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" htmlFor="ci-title" className="sm:col-span-2">
                    <Input id="ci-title" name="title" defaultValue={i.title} required maxLength={300} />
                  </Field>
                  <Field label="Topic" htmlFor="ci-topic">
                    <Input id="ci-topic" name="topic" defaultValue={v("topic")} maxLength={300} />
                  </Field>
                  <Field label="Content pillar" htmlFor="ci-pillar">
                    <Select id="ci-pillar" name="pillarId" defaultValue={v("pillarId")}>
                      <option value="">None</option>
                      {data.pillars
                        .filter((p) => !p.archivedAt || p.id === i.pillarId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Platform" htmlFor="ci-platform">
                    <Select id="ci-platform" name="platform" defaultValue={v("platform")}>
                      <option value="">Not decided</option>
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {PLATFORM_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Format" htmlFor="ci-format">
                    <FormatSelect id="ci-format" defaultValue={v("format")} />
                  </Field>
                  <Field label="Hook" htmlFor="ci-hook" className="sm:col-span-2">
                    <Input id="ci-hook" name="hook" defaultValue={v("hook")} maxLength={1000} placeholder="The first line or first 3 seconds" />
                  </Field>
                  <Field label="Script" htmlFor="ci-script" className="sm:col-span-2">
                    <Textarea id="ci-script" name="script" rows={10} defaultValue={v("script")} className="font-mono text-sm" />
                  </Field>
                  <Field label="Status" htmlFor="ci-status">
                    <Select id="ci-status" name="status" defaultValue={i.status} key={i.status}>
                      {CONTENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {CONTENT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Planned recording (plan)" htmlFor="ci-precord">
                    <Input id="ci-precord" name="plannedRecordOn" type="date" defaultValue={v("plannedRecordOn")} />
                  </Field>
                  <Field label="Recorded on (actual)" htmlFor="ci-recorded">
                    <Input id="ci-recorded" name="recordedOn" type="date" max={today} defaultValue={v("recordedOn")} />
                  </Field>
                  <Field label="Scheduled for (plan)" htmlFor="ci-scheduled">
                    <Input id="ci-scheduled" name="scheduledOn" type="date" defaultValue={v("scheduledOn")} />
                  </Field>
                  <Field label="Published on (actual)" htmlFor="ci-published" hint="Set when the status is Published">
                    <Input id="ci-published" name="publishedOn" type="date" max={today} defaultValue={v("publishedOn")} />
                  </Field>
                  <Field label="Published link" htmlFor="ci-url">
                    <Input id="ci-url" name="publishedUrl" type="url" defaultValue={v("publishedUrl")} placeholder="https://" />
                  </Field>
                  <Field label="Notes" htmlFor="ci-notes" className="sm:col-span-2">
                    <Textarea id="ci-notes" name="notes" rows={2} defaultValue={v("notes")} />
                  </Field>
                  {isPublished(i.status) ? (
                    <Field label="Performance review: what did you learn?" htmlFor="ci-review" className="sm:col-span-2" hint="Required to close the review">
                      <Textarea id="ci-review" name="reviewNotes" rows={3} defaultValue={v("reviewNotes")} />
                    </Field>
                  ) : null}
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          {isPublished(i.status) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance</CardTitle>
                <CardDescription>
                  Copy the numbers from {i.platform ? PLATFORM_LABELS[i.platform] : "the platform"}&rsquo;s insights. Leave blank what it doesn&rsquo;t report. Engagement is calculated.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {data.latest ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Engagement</dt>
                      <dd className="font-medium tabular-nums">{fmtNum(data.latest.engagement)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Engagement rate</dt>
                      <dd className="font-medium tabular-nums">
                        {data.latest.engagementRate ? `${(data.latest.engagementRate.rate * 100).toFixed(1)}% of ${data.latest.engagementRate.base}` : "—"}
                      </dd>
                    </div>
                    {i.platform
                      ? PLATFORM_EXTRA_METRICS[i.platform]
                          .filter((x) => data.latest!.snapshot.platformMetrics[x.key] != null)
                          .map((x) => (
                            <div key={x.key}>
                              <dt className="text-xs text-muted-foreground">{x.label}</dt>
                              <dd className="font-medium tabular-nums">{fmtNum(data.latest!.snapshot.platformMetrics[x.key])}</dd>
                            </div>
                          ))
                      : null}
                    {(["views", "reach", "leads", "followersGained"] as const).map((f) => (
                      <div key={f}>
                        <dt className="text-xs text-muted-foreground">{METRIC_LABELS[f]}</dt>
                        <dd className="font-medium tabular-nums">{fmtNum(data.latest!.snapshot[f])}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <details className="rounded-lg border p-3" open={i.status === "published"}>
                  <summary className="cursor-pointer text-sm font-medium">Record metrics</summary>
                  <ActionForm action={recordMetricsAction.bind(null, i.id)} submitLabel="Save metrics" submitVariant="outline" className="mt-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Field label="Captured on" htmlFor="m-date">
                        <Input id="m-date" name="capturedOn" type="date" min={i.publishedOn ?? undefined} max={today} defaultValue={today} />
                      </Field>
                      {fields.map((f) => (
                        <Field key={f} label={METRIC_LABELS[f]} htmlFor={`m-${f}`}>
                          <Input
                            id={`m-${f}`}
                            name={f}
                            type="number"
                            min="0"
                            max={PERCENT_FIELDS.includes(f) ? "100" : undefined}
                            step={f === "salesAmount" || f === "watchTimeMinutes" || f === "avgViewSeconds" || PERCENT_FIELDS.includes(f) ? "0.01" : "1"}
                            inputMode="decimal"
                          />
                        </Field>
                      ))}
                    </div>
                    {i.platform ? (
                      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <legend className="mb-2 text-xs font-medium text-muted-foreground">{PLATFORM_LABELS[i.platform]}-only</legend>
                        {PLATFORM_EXTRA_METRICS[i.platform].map((x) => (
                          <Field key={x.key} label={x.label} htmlFor={`mx-${x.key}`}>
                            <Input id={`mx-${x.key}`} name={`x_${x.key}`} type="number" min="0" max={x.percent ? "100" : undefined} step={x.percent ? "0.01" : "1"} inputMode="decimal" />
                          </Field>
                        ))}
                      </fieldset>
                    ) : null}
                    <Field label="Notes" htmlFor="m-notes">
                      <Input id="m-notes" name="notes" maxLength={2000} />
                    </Field>
                  </ActionForm>
                </details>
                {data.metrics.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm tabular-nums">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1 font-medium">Captured</th>
                          <th className="py-1 text-right font-medium">Views</th>
                          <th className="py-1 text-right font-medium">Reach</th>
                          <th className="py-1 text-right font-medium">Engagement</th>
                          <th className="py-1 text-right font-medium">Shares</th>
                          <th className="py-1 text-right font-medium">Saves</th>
                          <th className="py-1 text-right font-medium">Comments</th>
                          <th className="py-1 text-right font-medium">Leads</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.map((m) => (
                          <tr key={m.id} className="border-t">
                            <td className="py-1">{m.capturedOn}</td>
                            <td className="py-1 text-right">{fmtNum(m.views)}</td>
                            <td className="py-1 text-right">{fmtNum(m.reach)}</td>
                            <td className="py-1 text-right">{fmtNum(engagement(m))}</td>
                            <td className="py-1 text-right">{fmtNum(m.shares)}</td>
                            <td className="py-1 text-right">{fmtNum(m.saves)}</td>
                            <td className="py-1 text-right">{fmtNum(m.comments)}</td>
                            <td className="py-1 text-right">{fmtNum(m.leads)}</td>
                            <td className="text-right">
                              <form action={deleteMetricsAction.bind(null, m.id)}>
                                <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete metrics from ${m.capturedOn}`}>
                                  <Trash2 className="size-4" aria-hidden />
                                </SubmitButton>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Research sources</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {data.sources.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
                          {s.title}
                        </a>
                      ) : (
                        <span className="font-medium">{s.title}</span>
                      )}
                      {s.notes ? <p className="text-xs text-muted-foreground">{s.notes}</p> : null}
                    </div>
                    <form action={deleteSourceAction.bind(null, s.id)}>
                      <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Remove ${s.title}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <ActionForm action={addSourceAction.bind(null, i.id)} submitLabel="Add source" submitVariant="outline">
                <Field label="Source" htmlFor="s-title">
                  <Input id="s-title" name="title" required maxLength={300} placeholder="Book, paper, article, interview" />
                </Field>
                <Field label="Link" htmlFor="s-url">
                  <Input id="s-url" name="url" type="url" placeholder="https://" />
                </Field>
                <Field label="What it supports" htmlFor="s-notes">
                  <Input id="s-notes" name="notes" maxLength={5000} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repurpose</CardTitle>
              <CardDescription>Make a version for another platform with the same research and script.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.versions.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.versions.map((x) => (
                    <li key={x.id}>
                      <Link href={`/content/${x.id}`} className="underline-offset-2 hover:underline">
                        {x.platform ? PLATFORM_LABELS[x.platform] : ""} {x.format ? FORMAT_LABELS[x.format] : ""}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">· {CONTENT_STATUS_LABELS[x.status]}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={repurposeAction.bind(null, i.id)} submitLabel="Create version" submitVariant="outline">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Platform" htmlFor="r-platform">
                    <Select id="r-platform" name="platform" defaultValue={PLATFORMS.find((p) => p !== i.platform)}>
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {PLATFORM_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Format" htmlFor="r-format">
                    <FormatSelect id="r-format" defaultValue="" />
                  </Field>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <form action={archiveItemAction.bind(null, i.id)}>
            <SubmitButton variant="ghost" size="sm">
              Archive
            </SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
