import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";

/** `?day=YYYY-MM-DD` (defaults to today in the owner's timezone). */
export const dayQuery = z.object({ day: z.string().refine(isIsoDate, "Use a date like 2027-01-15.").optional() });
