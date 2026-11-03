import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { withUser, type Tx } from "@/db/client";
import { requireUser } from "@/lib/auth/current-user";
import { toAppError } from "@/lib/errors";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
} | null;

/**
 * Shared Server Action runner: authenticate, run inside withUser() (RLS),
 * map errors to a form-friendly state, and re-render affected pages.
 */
export async function runAction(
  fn: (tx: Tx) => Promise<unknown>,
  options: { success?: string; revalidate?: string[] } = {},
): Promise<ActionState> {
  try {
    const { userId } = await requireUser();
    await withUser(userId, fn);
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    const err = toAppError(e);
    return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
  }
  for (const path of options.revalidate ?? ["/"]) revalidatePath(path, "layout");
  return { ok: true, message: options.success };
}

/** For button-style actions without a result message. Errors propagate to the error boundary. */
export async function runSimpleAction(fn: (tx: Tx) => Promise<unknown>, revalidate: string[] = ["/"]): Promise<void> {
  const { userId } = await requireUser();
  await withUser(userId, fn);
  for (const path of revalidate) revalidatePath(path, "layout");
}

// --- FormData helpers -------------------------------------------------------

export function formText(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function formNullable(fd: FormData, key: string): string | null {
  return formText(fd, key) ?? null;
}

export function formNumber(fd: FormData, key: string): number | undefined {
  const v = formText(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? Number.NaN : n;
}

export function formNullableNumber(fd: FormData, key: string): number | null {
  return formNumber(fd, key) ?? null;
}

export function formCheckbox(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
