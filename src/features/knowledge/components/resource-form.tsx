import { ActionForm, type FormState } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { RESOURCE_KIND_LABELS, RESOURCE_KINDS, RESOURCE_STATUS_LABELS, RESOURCE_STATUSES } from "@/lib/domain/knowledge";
import type { ResourceRow } from "../server/service";

export function ResourceForm({
  action,
  initial,
  submitLabel,
  today,
  goals = [],
  categories = [],
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  initial?: ResourceRow;
  submitLabel: string;
  today: string;
  goals?: { id: string; title: string }[];
  categories?: string[];
}) {
  const v = (k: keyof ResourceRow) => (initial?.[k] == null ? "" : String(initial[k]));
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!initial}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="r-title" className="sm:col-span-2">
          <Input id="r-title" name="title" required maxLength={300} defaultValue={v("title")} />
        </Field>
        <Field label="Type" htmlFor="r-kind">
          <Select id="r-kind" name="kind" defaultValue={v("kind") || "book"}>
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESOURCE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Author / creator" htmlFor="r-author">
          <Input id="r-author" name="author" maxLength={300} defaultValue={v("author")} />
        </Field>
        <Field label="Category" htmlFor="r-category">
          <Input id="r-category" name="category" maxLength={100} defaultValue={v("category")} list="r-categories" placeholder="e.g. Negotiation" />
          <datalist id="r-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Status" htmlFor="r-status">
          <Select id="r-status" name="status" defaultValue={v("status") || "want"} key={v("status")}>
            {RESOURCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESOURCE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Started" htmlFor="r-start">
          <Input id="r-start" name="startedOn" type="date" max={today} defaultValue={v("startedOn")} />
        </Field>
        <Field label="Completed" htmlFor="r-done" hint="Set by marking it completed">
          <Input id="r-done" name="completedOn" type="date" max={today} defaultValue={v("completedOn")} />
        </Field>
        <Field label="Rating 1–5" htmlFor="r-rating">
          <Select id="r-rating" name="rating" defaultValue={v("rating")}>
            <option value="">Not rated</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Length (pages, lessons or minutes)" htmlFor="r-total">
          <Input id="r-total" name="totalUnits" type="number" min="1" inputMode="numeric" defaultValue={v("totalUnits")} />
        </Field>
        <Field label="Link" htmlFor="r-url" className="sm:col-span-2">
          <Input id="r-url" name="url" type="url" placeholder="https://" defaultValue={v("url")} />
        </Field>
        {goals.length ? (
          <Field label="Supports goal" htmlFor="r-goal" className="sm:col-span-2">
            <Select id="r-goal" name="goalId" defaultValue={v("goalId")}>
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {initial ? (
          <Field label="Notes" htmlFor="r-notes" className="sm:col-span-2">
            <Textarea id="r-notes" name="notes" rows={8} defaultValue={v("notes")} />
          </Field>
        ) : null}
      </div>
    </ActionForm>
  );
}
