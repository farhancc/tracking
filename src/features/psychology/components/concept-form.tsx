import { ActionForm, type FormState } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EVIDENCE_LEVEL_LABELS, EVIDENCE_LEVELS, PSYCH_CATEGORIES, PSYCH_CATEGORY_LABELS, SOURCE_TYPE_LABELS, SOURCE_TYPES } from "@/lib/domain/psychology";
import type { ConceptRow } from "../server/service";

export function ConceptForm({
  action,
  initial,
  submitLabel,
  today,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  initial?: ConceptRow;
  submitLabel: string;
  today: string;
}) {
  const v = (k: keyof ConceptRow) => (initial?.[k] as string | null | undefined) ?? "";
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!initial}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Concept" htmlFor="c-concept">
          <Input id="c-concept" name="concept" defaultValue={v("concept")} required maxLength={200} placeholder="e.g. Anchoring" />
        </Field>
        <Field label="Category" htmlFor="c-category">
          <Select id="c-category" name="category" defaultValue={v("category") || "persuasion"}>
            {PSYCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PSYCH_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Explanation (your own words)" htmlFor="c-explanation" className="sm:col-span-2">
          <Textarea id="c-explanation" name="explanation" rows={3} defaultValue={v("explanation")} required />
        </Field>
        <Field label="Source or book" htmlFor="c-source">
          <Input id="c-source" name="sourceTitle" defaultValue={v("sourceTitle")} maxLength={300} />
        </Field>
        <Field label="Author" htmlFor="c-author">
          <Input id="c-author" name="sourceAuthor" defaultValue={v("sourceAuthor")} maxLength={200} />
        </Field>
        <Field label="Source type" htmlFor="c-stype">
          <Select id="c-stype" name="sourceType" defaultValue={v("sourceType") || "popular_book"}>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_TYPE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link (paper, DOI, article)" htmlFor="c-url">
          <Input id="c-url" name="sourceUrl" type="url" defaultValue={v("sourceUrl")} placeholder="https://" />
        </Field>
        <Field
          label="Strength of evidence"
          htmlFor="c-evidence"
          hint="Be honest: popular books often overstate findings. Check for replications."
          className="sm:col-span-2"
        >
          <Select id="c-evidence" name="evidenceLevel" defaultValue={v("evidenceLevel") || "practitioner"}>
            {EVIDENCE_LEVELS.map((e) => (
              <option key={e} value={e}>
                {EVIDENCE_LEVEL_LABELS[e].label}: {EVIDENCE_LEVEL_LABELS[e].description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Evidence notes (replications, criticism)" htmlFor="c-enotes" className="sm:col-span-2">
          <Textarea id="c-enotes" name="evidenceNotes" rows={2} defaultValue={v("evidenceNotes")} />
        </Field>
        <Field label="Practical example" htmlFor="c-example">
          <Textarea id="c-example" name="example" rows={2} defaultValue={v("example")} />
        </Field>
        <Field label="Ethical considerations" htmlFor="c-ethics">
          <Textarea id="c-ethics" name="ethics" rows={2} defaultValue={v("ethics")} placeholder="Where does this become manipulation?" />
        </Field>
        <Field label="Where I can apply it" htmlFor="c-apply">
          <Textarea id="c-apply" name="whereToApply" rows={2} defaultValue={v("whereToApply")} />
        </Field>
        <Field label="My observations" htmlFor="c-obs">
          <Textarea id="c-obs" name="observations" rows={2} defaultValue={v("observations")} />
        </Field>
        <Field label="Key takeaways" htmlFor="c-take" className="sm:col-span-2">
          <Textarea id="c-take" name="takeaways" rows={2} defaultValue={v("takeaways")} />
        </Field>
        <Field label="Learned on" htmlFor="c-learned">
          <Input id="c-learned" name="learnedOn" type="date" max={today} defaultValue={v("learnedOn") || today} />
        </Field>
      </div>
    </ActionForm>
  );
}
