import { z } from "zod";

export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found.`);

const CONSTRAINT_MESSAGES: Record<string, string> = {
  goals_dates_check: "The target date must be on or after the start date.",
  goals_five_year_root_check: "A five-year goal sits at the top of the hierarchy and needs a vision category.",
  goals_currency_check: "Money goals need a three-letter currency code, and only money goals may have one.",
  goals_boolean_values_check: "Yes/no goals use baseline and target 0 or 1 and the 'latest value' mode.",
  goals_priority_check: "Priority must be between 1 (critical) and 4 (low).",
  goals_title_check: "The title must be 1–200 characters.",
  goals_success_metric_check: "The success metric must be 1–200 characters.",
  goals_not_own_parent_check: "A goal cannot be its own parent.",
  goals_parent_fk: "This goal still has sub-goals. Archive it instead, or move the sub-goals first.",
  tasks_goal_fk: "This goal still has tasks linked to it. Archive it instead.",
  goal_dependencies_not_self_check: "A goal cannot depend on itself.",
  goal_dependencies_pkey: "That dependency already exists.",
  goal_links_pkey: "Those goals are already linked.",
  goal_links_canonical_order_check: "A goal cannot be linked to itself.",
  journeys_one_active_per_user: "You already have an active five-year journey.",
  visions_journey_version_key: "The vision was changed by another save. Reload and try again.",
  prospects_content_item_fk: "That content item doesn't exist.",
};

type PgError = { code: string; message: string; detail?: string; constraint?: string };

function findPgError(e: unknown): PgError | null {
  let current: unknown = e;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      typeof (current as { code: unknown }).code === "string" &&
      "severity" in current
    ) {
      return current as unknown as PgError;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return null;
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof z.ZodError) {
    const flat = z.flattenError(e);
    return new AppError(400, "invalid_input", flat.formErrors[0] ?? "Some fields are invalid.", flat.fieldErrors as FieldErrors);
  }
  const pg = findPgError(e);
  if (pg) {
    const known = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
    switch (pg.code) {
      case "P0001": // raised by goal engine triggers; DETAIL carries the machine code
        return new AppError(422, pg.detail || "rule_violation", pg.message);
      case "23514":
        return new AppError(422, "constraint_violation", known ?? "A value breaks a data rule.");
      case "23505":
        return new AppError(409, "conflict", known ?? "That record already exists.");
      case "23503":
        return new AppError(409, "reference_conflict", known ?? "A referenced record is missing or still in use.");
      case "22P02":
      case "22007":
      case "22008":
        return new AppError(400, "invalid_input", "A value has the wrong format.");
      case "42501":
        return new AppError(403, "forbidden", "Not allowed.");
    }
  }
  // Drizzle refuses an UPDATE with nothing in SET: a PATCH whose body has no recognised fields.
  if (e instanceof Error && e.message === "No values to set") {
    return new AppError(400, "invalid_input", "Send at least one field to change.");
  }
  console.error(e);
  return new AppError(500, "internal_error", "Something went wrong.");
}
