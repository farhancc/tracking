import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { logPracticeAction } from "../server/actions";
import { RecordingField } from "./recording-field";

/** Practice log form; the optional exercise list lets the skill page pick which exercise was done. */
export function PracticeForm({
  exerciseId,
  skillId,
  exercises,
  wantsRecording = false,
  wantsWords = false,
  today,
  idPrefix,
}: {
  exerciseId?: string;
  skillId?: string;
  exercises?: { id: string; title: string }[];
  wantsRecording?: boolean;
  wantsWords?: boolean;
  today: string;
  idPrefix: string;
}) {
  return (
    <ActionForm action={logPracticeAction.bind(null, { exerciseId, skillId })} submitLabel="Log practice" submitVariant="outline">
      <div className="grid gap-3 sm:grid-cols-3">
        {exercises ? (
          <Field label="Exercise" htmlFor={`${idPrefix}-ex`} className="sm:col-span-3">
            <Select id={`${idPrefix}-ex`} name="exerciseId" defaultValue="">
              <option value="">Free practice</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Minutes" htmlFor={`${idPrefix}-min`}>
          <Input id={`${idPrefix}-min`} name="durationMinutes" type="number" min={0} max={600} defaultValue={10} />
        </Field>
        <Field label="How it went (1–5)" htmlFor={`${idPrefix}-rating`}>
          <Select id={`${idPrefix}-rating`} name="selfRating" defaultValue="">
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor={`${idPrefix}-date`}>
          <Input id={`${idPrefix}-date`} name="practicedOn" type="date" max={today} defaultValue={today} />
        </Field>
        {wantsWords ? (
          <Field label="Words (comma-separated)" htmlFor={`${idPrefix}-words`} className="sm:col-span-3">
            <Input id={`${idPrefix}-words`} name="words" placeholder="candid, succinct, rapport, leverage, concede" />
          </Field>
        ) : null}
        <Field label="Your explanation, summary or response" htmlFor={`${idPrefix}-content`} className="sm:col-span-3">
          <Textarea id={`${idPrefix}-content`} name="content" rows={3} />
        </Field>
        <Field label="Notes: what to improve" htmlFor={`${idPrefix}-notes`} className="sm:col-span-3">
          <Input id={`${idPrefix}-notes`} name="notes" maxLength={5000} />
        </Field>
        {wantsRecording || exercises ? (
          <div className="sm:col-span-3">
            <RecordingField />
          </div>
        ) : null}
      </div>
    </ActionForm>
  );
}
