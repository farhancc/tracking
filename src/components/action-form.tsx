"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
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
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  submitVariant?: "default" | "outline" | "secondary" | "destructive";
  resetOnSuccess?: boolean;
}) {
  const [rawState, formAction, pending] = useActionState(action, null);
  const state = useFreshState(rawState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (rawState?.ok && resetOnSuccess) ref.current?.reset();
  }, [rawState, resetOnSuccess]);

  const fieldMessages = state?.fieldErrors
    ? Object.values(state.fieldErrors).flatMap((m) => m ?? [])
    : [];

  return (
    <form ref={ref} action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      {state && !state.ok ? (
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
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant={submitVariant} disabled={pending} className={submitClassName}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
