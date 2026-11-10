import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { CONTENT_STATUS_LABELS, CONTENT_STATUSES } from "@/lib/domain/content";
import { archivePillarAction, createPillarAction, renamePillarAction, saveBrandAction } from "../server/actions";
import { loadContentOverview } from "../server/queries";
import { ContentNav } from "./content-nav";
import { IdeaCapture } from "./idea-capture";
import { ItemCard } from "./item-card";

export async function ContentPipeline() {
  const data = await loadContentOverview();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const pillarName = new Map(data.pillars.map((p) => [p.id, p.name]));
  const recentReviewed = new Set(
    data.items
      .filter((i) => i.status === "reviewed")
      .slice(0, 12)
      .map((i) => i.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{data.brand.positioning}</p>
      </div>
      <ContentNav current="/content" />
      <IdeaCapture pillars={data.pillars} />

      {data.overdue.length || data.awaitingReview.length ? (
        <div className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {data.overdue.length ? <p>{data.overdue.length} scheduled item(s) are past their date and not marked published.</p> : null}
          {data.awaitingReview.length ? <p>{data.awaitingReview.length} item(s) published over a week ago are waiting for a performance review.</p> : null}
        </div>
      ) : null}

      <section aria-label="Pipeline" tabIndex={0} className="-mx-4 overflow-x-auto px-4 pb-2 focus-visible:outline-2 focus-visible:outline-ring">
        <ol className="grid min-w-[1120px] grid-cols-8 gap-3">
          {CONTENT_STATUSES.map((s) => {
            const list = data.items.filter((i) => i.status === s && (s !== "reviewed" || recentReviewed.has(i.id)));
            return (
              <li key={s} className="flex min-w-0 flex-col gap-2">
                <h2 className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CONTENT_STATUS_LABELS[s]} <span className="tabular-nums">{data.counts[s]}</span>
                </h2>
                {list.slice(0, 25).map((i) => (
                  <ItemCard key={i.id} item={i} pillarName={i.pillarId ? pillarName.get(i.pillarId) : undefined} today={data.today} />
                ))}
                {s === "idea" && data.counts.idea > 25 ? (
                  <Link href="/content/ideas" className="text-xs underline-offset-2 hover:underline">
                    All {data.counts.idea} ideas
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pillar mix</CardTitle>
            <CardDescription>Published in the last 90 days, and in production now.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {data.pillarMix.map(({ pillar, published90, inProgress }) => {
                const max = Math.max(1, ...data.pillarMix.map((p) => p.published90));
                return (
                  <li key={pillar.id} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2">
                      <span>{pillar.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {published90} published · {inProgress} in progress
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                      <div className="h-1.5 rounded-full bg-[var(--chart-1)]" style={{ width: `${(published90 / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p> : null}
            <ul className="flex flex-col gap-1 text-sm">
              {data.upcoming.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link href={`/content/${i.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                    {i.title}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">{i.scheduledOn}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positioning and pillars</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Edit positioning</summary>
              <ActionForm action={saveBrandAction} submitLabel="Save" submitVariant="outline" resetOnSuccess={false} className="mt-3">
                <Field label="Positioning" htmlFor="b-pos">
                  <Textarea id="b-pos" name="positioning" rows={4} defaultValue={data.brand.positioning} required />
                </Field>
                <Field label="Audience" htmlFor="b-aud">
                  <Input id="b-aud" name="audience" defaultValue={data.brand.audience ?? ""} placeholder="Who you want to reach" />
                </Field>
              </ActionForm>
            </details>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Edit pillars</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {data.pillars.map((p) => (
                  <li key={p.id} className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <ActionForm action={renamePillarAction.bind(null, p.id)} submitLabel="Rename" submitVariant="outline" inline resetOnSuccess={false} submitClassName="h-9">
                        <Input name="name" defaultValue={p.name} aria-label={`Pillar name: ${p.name}`} maxLength={80} />
                      </ActionForm>
                    </div>
                    <form action={archivePillarAction.bind(null, p.id)}>
                      <SubmitButton variant="ghost" size="sm" className="h-9">
                        Archive
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <ActionForm action={createPillarAction} submitLabel="Add" inline submitClassName="h-9">
                  <Input name="name" required maxLength={80} placeholder="New pillar" aria-label="New pillar" />
                </ActionForm>
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
