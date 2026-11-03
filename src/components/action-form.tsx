"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFreshState } from "./use-fresh-state";

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[] | undefined> } | null;

/**
 * Small Server Action form with pending state and an inline result message.
 * Field errors are summarised in the message; larger forms render them per field.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className,
  submitClassName,
  submitVariant = "default",
  resetOnSuccess = true,
  inline = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  submitVariant?: "default" | "outline" | "secondary" | "destructive";
  resetOnSuccess?: boolean;
  /** Fields and button on one row; errors go on their own line and success messages are omitted. */
  inline?: boolean;
}) {
  const [rawState, formAction, pending] = useActionState(action, null);
  const state = useFreshState(rawState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (rawState?.ok && resetOnSuccess) ref.current?.reset();
  }, [rawState, resetOnSuccess]);

  // React 19 resets uncontrolled fields after every resolved form action, even
  // one that returned an error, wiping what the user typed. Submitting through
  // a transition keeps the input; we reset ourselves only on success. `action`
  // stays on the form so it still works before hydration / without JavaScript.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };

  const fieldMessages = state?.fieldErrors
    ? Object.values(state.fieldErrors).flatMap((m) => m ?? [])
    : [];

  const error =
    state && !state.ok ? (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p>{state.message}</p>
        {fieldMessages.length > 0 && fieldMessages[0] !== state.message ? (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {fieldMessages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null;
  const submit = (
    <Button type="submit" variant={submitVariant} disabled={pending} className={submitClassName}>
      {pending ? pendingLabel : submitLabel}
    </Button>
  );

  if (inline) {
    return (
      <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex min-w-0 flex-col gap-2">
        <div className={cn("flex flex-row items-center gap-2", className)}>
          {children}
          {submit}
        </div>
        {error}
      </form>
    );
  }

  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className={cn("flex flex-col gap-3", className)}>
      {children}
      {error}
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <div>{submit}</div>
    </form>
  );
}
