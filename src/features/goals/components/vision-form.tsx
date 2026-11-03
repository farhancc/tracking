"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { useFreshState } from "@/components/use-fresh-state";
import { saveVisionAction, type ActionState } from "../server/actions";

export function VisionForm({
  initial,
}: {
  initial: { title: string; statement: string; professionalIdentity: string; exitStrategy: string };
}) {
  const [rawState, action, pending] = useActionState<ActionState, FormData>(saveVisionAction, null);
  const state = useFreshState(rawState);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="title" errors={errors.title}>
        <Input id="title" name="title" defaultValue={initial.title} maxLength={200} />
      </Field>
      <Field
        label="Five-year vision"
        htmlFor="statement"
        hint="Describe your life and work five years from now, in the present tense."
        errors={errors.statement}
      >
        <Textarea id="statement" name="statement" defaultValue={initial.statement} rows={6} required />
      </Field>
      <Field
        label="Desired professional identity"
        htmlFor="professionalIdentity"
        hint="Who you are known as, e.g. 'A founder who sells, and a teacher of persuasive communication.'"
        errors={errors.professionalIdentity}
      >
        <Textarea id="professionalIdentity" name="professionalIdentity" defaultValue={initial.professionalIdentity} rows={3} />
      </Field>
      <Field
        label="Retirement or employment exit strategy"
        htmlFor="exitStrategy"
        hint="The narrative behind your exit. Add each measurable exit condition as a five-year goal below."
        errors={errors.exitStrategy}
      >
        <Textarea id="exitStrategy" name="exitStrategy" defaultValue={initial.exitStrategy} rows={3} />
      </Field>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save new version"}
        </Button>
      </div>
    </form>
  );
}
