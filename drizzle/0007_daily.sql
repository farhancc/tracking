CREATE TABLE "day_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"day" date NOT NULL,
	"available_minutes" integer,
	"accomplished" text,
	"learned" text,
	"went_wrong" text,
	"improve_tomorrow" text,
	"reflected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_plans_user_day_key" UNIQUE("user_id","day"),
	CONSTRAINT "day_plans_available_check" CHECK ("day_plans"."available_minutes" is null or "day_plans"."available_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"habit_id" uuid NOT NULL,
	"checkin_on" date NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_checkins_habit_day_key" UNIQUE("habit_id","checkin_on"),
	CONSTRAINT "habit_checkins_status_check" CHECK ("habit_checkins"."status" in ('done', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"pillar_id" uuid,
	"schedule_days" smallint[] DEFAULT '{0,1,2,3,4,5,6}'::smallint[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "habits_name_check" CHECK (length(btrim("habits"."name")) between 1 and 120),
	CONSTRAINT "habits_schedule_check" CHECK (cardinality("habits"."schedule_days") between 1 and 7 and "habits"."schedule_days" <@ '{0,1,2,3,4,5,6}'::smallint[])
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_start" time;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mit_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mit_rank" smallint;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_pillar_fk" FOREIGN KEY ("pillar_id","user_id") REFERENCES "public"."pillars"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_checkins_user_day_idx" ON "habit_checkins" USING btree ("user_id","checkin_on");--> statement-breakpoint
CREATE INDEX "tasks_user_scheduled_idx" ON "tasks" USING btree ("user_id","scheduled_on");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_one_mit_per_rank" ON "tasks" USING btree ("user_id","mit_on","mit_rank") WHERE "tasks"."mit_on" is not null;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_mit_check" CHECK (("tasks"."mit_on" is null) = ("tasks"."mit_rank" is null) and ("tasks"."mit_rank" is null or "tasks"."mit_rank" between 1 and 3));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_finish_after_start_check" CHECK ("tasks"."finished_at" is null or "tasks"."started_at" is null or "tasks"."finished_at" >= "tasks"."started_at");