import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
const flag = z.union([z.boolean(), z.enum(["on", "true", "false"])]).transform((v) => v === true || v === "on" || v === "true");

export const preferencesSchema = z.object({
  daily_planning: z.object({ enabled: flag, time }),
  task_deadlines: z.object({ enabled: flag, time }),
  weekly_review: z.object({ enabled: flag, time, weekday: z.coerce.number().int().min(0).max(6) }),
  monthly_review: z.object({ enabled: flag, time }),
  habits: z.object({ enabled: flag, time }),
  milestones: z.object({ enabled: flag }),
  quietStart: time.nullish().transform((v) => v ?? null),
  quietEnd: time.nullish().transform((v) => v ?? null),
  push: flag,
});

export const subscriptionSchema = z.object({
  endpoint: z.string().url().refine((u) => u.startsWith("https://"), "Push endpoints are https URLs."),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(10).max(500) }),
});
