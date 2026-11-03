import { ActionForm, type FormState } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { BUSINESS_MODEL_LABELS, BUSINESS_MODELS, PRODUCT_STAGE_LABELS, PRODUCT_STAGES } from "@/lib/domain/products";
import type { ProductRow } from "../server/service";

export function ProductForm({
  action,
  initial,
  submitLabel,
  today,
  baseCurrency,
  goals,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  initial?: ProductRow;
  submitLabel: string;
  today: string;
  baseCurrency: string;
  goals: { id: string; title: string; level: string }[];
}) {
  const v = (k: keyof ProductRow) => (initial?.[k] as string | null | undefined) ?? "";
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!initial}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name" htmlFor="p-name">
          <Input id="p-name" name="name" required maxLength={120} defaultValue={v("name")} />
        </Field>
        <Field label="Business model" htmlFor="p-model">
          <Select id="p-model" name="businessModel" defaultValue={v("businessModel") || "subscription"}>
            {BUSINESS_MODELS.map((m) => (
              <option key={m} value={m}>
                {BUSINESS_MODEL_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
          <Textarea id="p-desc" name="description" rows={2} defaultValue={v("description")} />
        </Field>
        <Field label="Target customer" htmlFor="p-customer">
          <Input id="p-customer" name="targetCustomer" defaultValue={v("targetCustomer")} placeholder="Who pays?" />
        </Field>
        <Field label="Pricing" htmlFor="p-pricing">
          <Input id="p-pricing" name="pricing" defaultValue={v("pricing")} placeholder="e.g. $49/month, $490/year" />
        </Field>
        <Field label="Problem being solved" htmlFor="p-problem" className="sm:col-span-2">
          <Textarea id="p-problem" name="problem" rows={2} defaultValue={v("problem")} />
        </Field>
        <Field label="Value proposition" htmlFor="p-value" className="sm:col-span-2">
          <Textarea id="p-value" name="valueProposition" rows={2} defaultValue={v("valueProposition")} />
        </Field>
        <Field label="Customer acquisition channels" htmlFor="p-channels" hint="Comma-separated" className="sm:col-span-2">
          <Input id="p-channels" name="acquisitionChannels" defaultValue={initial?.acquisitionChannels.join(", ") ?? ""} placeholder="cold email, SEO, partnerships" />
        </Field>
        {!initial ? (
          <Field label="Stage" htmlFor="p-stage">
            <Select id="p-stage" name="stage" defaultValue="idea">
              {PRODUCT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Currency" htmlFor="p-currency" hint={initial ? "Locked once money is recorded" : undefined}>
          <Input id="p-currency" name="currency" defaultValue={v("currency") || baseCurrency} maxLength={3} pattern="[A-Za-z]{3}" required />
        </Field>
        <Field label="Started on" htmlFor="p-started">
          <Input id="p-started" name="startedOn" type="date" max={today} defaultValue={v("startedOn") || today} />
        </Field>
        <Field label="Planned launch (forecast)" htmlFor="p-planned">
          <Input id="p-planned" name="plannedLaunchOn" type="date" defaultValue={v("plannedLaunchOn")} />
        </Field>
        <Field label="Launched on (actual)" htmlFor="p-launched" hint="Required for Launch, Growth and Optimization">
          <Input id="p-launched" name="launchedOn" type="date" max={today} defaultValue={v("launchedOn")} />
        </Field>
        {goals.length ? (
        <Field label="Contributes to goal" htmlFor="p-goal" className="sm:col-span-2">
          <Select id="p-goal" name="goalId" defaultValue={v("goalId")}>
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.level.replace("_", " ")})
              </option>
            ))}
          </Select>
        </Field>
        ) : null}
      </div>
    </ActionForm>
  );
}
