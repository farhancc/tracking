CREATE TABLE "week_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"week_start" date NOT NULL,
	"focus" text,
	"capacity_hours" numeric(5, 1),
	"wins" text,
	"lessons" text,
	"notes" text,
	"scorecard" jsonb,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_plans_user_week_key" UNIQUE("user_id","week_start"),
	CONSTRAINT "week_plans_capacity_check" CHECK ("week_plans"."capacity_hours" is null or "week_plans"."capacity_hours" between 0 and 120)
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "focus_area" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimated_minutes" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "actual_minutes" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "planned_week" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "is_deliverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "carry_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "carried_from_week" date;--> statement-breakpoint
ALTER TABLE "week_plans" ADD CONSTRAINT "week_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_week_idx" ON "tasks" USING btree ("user_id","planned_week");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_focus_area_check" CHECK ("goals"."focus_area" is null or "goals"."focus_area" in ('sales', 'product', 'marketing', 'content', 'learning', 'personal'));--> statement-breakpoint
-- Backfill existing weekly goals before the focus-area rule applies.
UPDATE "goals" SET "focus_area" = 'personal' WHERE "level" = 'weekly' AND NOT "is_key_result" AND "focus_area" IS NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_weekly_focus_area_check" CHECK ("goals"."level" <> 'weekly' or "goals"."is_key_result" or "goals"."focus_area" is not null);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" between 1 and 4);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_minutes_check" CHECK (("tasks"."estimated_minutes" is null or "tasks"."estimated_minutes" between 0 and 10000) and ("tasks"."actual_minutes" is null or "tasks"."actual_minutes" between 0 and 10000));