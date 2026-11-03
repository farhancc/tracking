import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { ACCOUNT_KINDS, ESSENTIAL_BY_DEFAULT, EXPENSE_CATEGORIES, INCOME_SOURCES } from "@/lib/domain/finance";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optDate = isoDate.nullish().transform((v) => v ?? null);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const amount = z.coerce.number().positive("Enter an amount above zero.").max(1e13).multipleOf(0.01, "Use at most two decimals.");
const flag = z
  .union([z.boolean(), z.enum(["on", "true", "false", "yes", "no"])])
  .nullish()
  .transform((v) => (v == null ? null : v === true || v === "on" || v === "true" || v === "yes"));

export const settingsSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code.").optional(),
  withdrawalRatePct: z.coerce.number().gt(0, "Above 0%.").max(20).optional(),
  annualExpensesEstimate: z.coerce.number().positive().max(1e13).nullish().transform((v) => v ?? null),
  expectedReturnPct: z.coerce.number().min(-20).max(30).optional(),
  emergencyMonths: z.coerce.number().min(0).max(60).optional(),
});

export const incomeSchema = z.object({
  receivedOn: optDate,
  source: z.enum(INCOME_SOURCES),
  amount,
  recurring: flag.transform((v) => v ?? false),
  description: optionalText(300),
});

export const expenseSchema = z
  .object({
    spentOn: optDate,
    category: z.enum(EXPENSE_CATEGORIES),
    amount,
    essential: flag,
    description: optionalText(300),
  })
  .transform((v) => ({ ...v, essential: v.essential ?? ESSENTIAL_BY_DEFAULT.includes(v.category) }));

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account.").max(120),
  kind: z.enum(ACCOUNT_KINDS),
  interestRatePct: z.coerce.number().min(0).max(100).nullish().transform((v) => v ?? null),
  notes: optionalText(1000),
  /** Optional opening balance (today). */
  balance: z.coerce.number().min(0).max(1e13).nullish().transform((v) => v ?? null),
});

export const balanceSchema = z.object({
  asOf: optDate,
  balance: z.coerce.number().min(0, "Enter what it holds (or what you owe) as a positive number.").max(1e13),
});

export const forecastSchema = z
  .object({
    month: z
      .string()
      .trim()
      .transform((d) => `${d.slice(0, 7)}-01`)
      .refine(isIsoDate, "Pick a month."),
    kind: z.enum(["income", "expense"]),
    label: z.string().trim().min(1, "Describe it.").max(200),
    amount,
    source: z.enum(INCOME_SOURCES).nullish().transform((v) => v ?? null),
  })
  .transform((v) => ({ ...v, source: v.kind === "income" ? v.source : null }));
