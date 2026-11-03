CREATE TABLE "rest_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"day" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rest_days_user_day_key" UNIQUE("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "habit_checkins" DROP CONSTRAINT "habit_checkins_status_check";--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "schedule_kind" text DEFAULT 'days' NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "weekly_target" smallint;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "started_on" date DEFAULT current_date NOT NULL;--> statement-breakpoint
ALTER TABLE "rest_days" ADD CONSTRAINT "rest_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_status_check" CHECK ("habit_checkins"."status" in ('done', 'skipped', 'rest'));--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_schedule_kind_check" CHECK ("habits"."schedule_kind" in ('days', 'weekly'));--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_weekly_target_check" CHECK (("habits"."schedule_kind" = 'weekly') = ("habits"."weekly_target" is not null) and ("habits"."weekly_target" is null or "habits"."weekly_target" between 1 and 7));