import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { PRODUCT_STAGE_LABELS, PRODUCT_STAGES, PRODUCT_STATUSES } from "@/lib/domain/products";
import { cn } from "@/lib/utils";
import { archiveProductAction, setStageAction } from "../server/actions";
import { loadProduct } from "../server/queries";
import { BuildTab, FeedbackTab, FinanceTab, OverviewTab } from "./product-tabs";
import { RecommendationBadge } from "./recommendation-badge";
import { ValidationTab } from "./validation-tab";

const TABS = [
  ["overview", "Overview"],
  ["validation", "Validation"],
  ["finance", "Revenue & expenses"],
  ["build", "Releases, backlog & bugs"],
  ["feedback", "Customer feedback"],
] as const;
export type Tab = (typeof TABS)[number][0];

type Params = Record<string, string | string[] | undefined>;
const str = (p: Params, k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);

export async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;
  const range = { from: str(sp, "from")?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0], to: str(sp, "to")?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] };
  const data = await loadProduct(id, range).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const p = data.product;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Portfolio
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <Badge variant="outline">{PRODUCT_STAGE_LABELS[p.stage]}</Badge>
          {p.status !== "active" ? <Badge variant="warning">{p.status === "paused" ? "Paused" : "Discontinued"}</Badge> : null}
          <RecommendationBadge value={data.assessment.recommendation} />
        </div>
        {p.description ? <p className="max-w-3xl text-sm text-muted-foreground">{p.description}</p> : null}
        <ol aria-label="Development stages" className="flex flex-wrap gap-1 text-[11px]">
          {PRODUCT_STAGES.map((s, i) => {
            const at = PRODUCT_STAGES.indexOf(p.stage);
            return (
              <li
                key={s}
                aria-current={s === p.stage ? "step" : undefined}
                className={cn(
                  "rounded-full border px-2 py-0.5",
                  i < at && "border-transparent bg-muted text-muted-foreground",
                  s === p.stage && "border-primary bg-primary text-primary-foreground",
                  i > at && "text-muted-foreground",
                )}
              >
                {PRODUCT_STAGE_LABELS[s]}
              </li>
            );
          })}
        </ol>
        <details className="max-w-xl rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Change stage or status</summary>
          <ActionForm action={setStageAction.bind(null, p.id)} submitLabel="Update" submitVariant="outline" className="mt-3" resetOnSuccess={false}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage" htmlFor="s-stage">
                <Select id="s-stage" name="stage" defaultValue={p.stage} key={p.stage}>
                  {PRODUCT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PRODUCT_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="s-status">
                <Select id="s-status" name="status" defaultValue={p.status} key={p.status}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Why" htmlFor="s-note" hint="Moving to Launch records today as the launch date unless one is set.">
              <Input id="s-note" name="statusNote" defaultValue={p.statusNote ?? ""} maxLength={2000} />
            </Field>
            {PRODUCT_STAGES.indexOf(p.stage) < PRODUCT_STAGES.indexOf("mvp") && data.validation.demand.level < 3 ? (
              <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <input type="checkbox" name="acknowledgeUnvalidated" className="mt-1" />
                <span>
                  Demand evidence is at &ldquo;{data.validation.demand.levelLabel}&rdquo;. Moving to MVP or later means building before 3 customers committed to pay.
                  Tick to do it anyway, and say why above.
                </span>
              </label>
            ) : null}
          </ActionForm>
        </details>
      </header>

      <nav aria-label="Product sections" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/products/${p.id}${key === "overview" ? "" : `?tab=${key}`}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab data={data} /> : null}
      {tab === "validation" ? <ValidationTab data={data} /> : null}
      {tab === "finance" ? <FinanceTab data={data} /> : null}
      {tab === "build" ? <BuildTab data={data} /> : null}
      {tab === "feedback" ? <FeedbackTab data={data} /> : null}

      {tab === "overview" ? (
        <form action={archiveProductAction.bind(null, p.id)}>
          <SubmitButton variant="ghost" size="sm">
            Archive product
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
