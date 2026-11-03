CREATE TABLE "quarter_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"quarter_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"due_on" date,
	"estimated_hours" numeric(8, 1),
	"status" text DEFAULT 'planned' NOT NULL,
	"delivered_on" date,
	"evidence" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarter_deliverables_status_check" CHECK ("quarter_deliverables"."status" in ('planned', 'in_progress', 'delivered', 'dropped')),
	CONSTRAINT "quarter_deliverables_title_check" CHECK (length(btrim("quarter_deliverables"."title")) between 1 and 300),
	CONSTRAINT "quarter_deliverables_delivered_check" CHECK (("quarter_deliverables"."status" = 'delivered') = ("quarter_deliverables"."delivered_on" is not null)),
	CONSTRAINT "quarter_deliverables_hours_check" CHECK ("quarter_deliverables"."estimated_hours" is null or "quarter_deliverables"."estimated_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quarter_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"quarter_id" uuid NOT NULL,
	"description" text NOT NULL,
	"depends_on_goal_id" uuid,
	"needed_by" date,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarter_dependencies_status_check" CHECK ("quarter_dependencies"."status" in ('open', 'resolved')),
	CONSTRAINT "quarter_dependencies_description_check" CHECK (length(btrim("quarter_dependencies"."description")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "quarter_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"quarter_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'number' NOT NULL,
	"currency" char(3),
	"direction" text DEFAULT 'up' NOT NULL,
	"target_value" numeric(20, 4) NOT NULL,
	"actual_value" numeric(20, 4),
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarter_kpis_unit_check" CHECK ("quarter_kpis"."unit" in ('number', 'count', 'currency', 'percent', 'hours', 'boolean')),
	CONSTRAINT "quarter_kpis_direction_check" CHECK ("quarter_kpis"."direction" in ('up', 'down')),
	CONSTRAINT "quarter_kpis_name_check" CHECK (length(btrim("quarter_kpis"."name")) between 1 and 200),
	CONSTRAINT "quarter_kpis_currency_check" CHECK (("quarter_kpis"."unit" = 'currency') = ("quarter_kpis"."currency" is not null))
);
--> statement-breakpoint
CREATE TABLE "quarter_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"quarter_id" uuid NOT NULL,
	"title" text NOT NULL,
	"likelihood" smallint DEFAULT 3 NOT NULL,
	"impact" smallint DEFAULT 3 NOT NULL,
	"score" smallint GENERATED ALWAYS AS (likelihood * impact) STORED NOT NULL,
	"mitigation" text,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarter_risks_scale_check" CHECK ("quarter_risks"."likelihood" between 1 and 5 and "quarter_risks"."impact" between 1 and 5),
	CONSTRAINT "quarter_risks_status_check" CHECK ("quarter_risks"."status" in ('open', 'mitigated', 'occurred', 'closed')),
	CONSTRAINT "quarter_risks_title_check" CHECK (length(btrim("quarter_risks"."title")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "roadmap_quarters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"journey_id" uuid NOT NULL,
	"year_number" smallint NOT NULL,
	"quarter_number" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"focus" text,
	"capacity_hours_per_week" numeric(5, 1),
	"mid_review_on" date,
	"review_on" date,
	"reviewed_at" timestamp with time zone,
	"review_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_quarters_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "roadmap_quarters_journey_quarter_key" UNIQUE("journey_id","quarter_number"),
	CONSTRAINT "roadmap_quarters_number_check" CHECK ("roadmap_quarters"."quarter_number" between 1 and 20 and "roadmap_quarters"."year_number" between 1 and 5),
	CONSTRAINT "roadmap_quarters_dates_check" CHECK ("roadmap_quarters"."end_date" > "roadmap_quarters"."start_date"),
	CONSTRAINT "roadmap_quarters_capacity_check" CHECK ("roadmap_quarters"."capacity_hours_per_week" is null or "roadmap_quarters"."capacity_hours_per_week" between 0 and 120),
	CONSTRAINT "roadmap_quarters_review_dates_check" CHECK (("roadmap_quarters"."mid_review_on" is null or "roadmap_quarters"."mid_review_on" between "roadmap_quarters"."start_date" and "roadmap_quarters"."end_date") and ("roadmap_quarters"."review_on" is null or "roadmap_quarters"."review_on" >= "roadmap_quarters"."start_date"))
);
--> statement-breakpoint
CREATE TABLE "roadmap_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"journey_id" uuid NOT NULL,
	"year_number" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"theme" text NOT NULL,
	"direction" text NOT NULL,
	"is_provisional" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_years_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "roadmap_years_journey_year_key" UNIQUE("journey_id","year_number"),
	CONSTRAINT "roadmap_years_number_check" CHECK ("roadmap_years"."year_number" between 1 and 5),
	CONSTRAINT "roadmap_years_dates_check" CHECK ("roadmap_years"."end_date" > "roadmap_years"."start_date")
);
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_measurement_mode_check";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "weekly_capacity_hours" numeric(5, 1) DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "is_key_result" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "estimated_hours" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "quarter_deliverables" ADD CONSTRAINT "quarter_deliverables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_deliverables" ADD CONSTRAINT "quarter_deliverables_quarter_fk" FOREIGN KEY ("quarter_id","user_id") REFERENCES "public"."roadmap_quarters"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_deliverables" ADD CONSTRAINT "quarter_deliverables_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_dependencies" ADD CONSTRAINT "quarter_dependencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_dependencies" ADD CONSTRAINT "quarter_dependencies_quarter_fk" FOREIGN KEY ("quarter_id","user_id") REFERENCES "public"."roadmap_quarters"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_dependencies" ADD CONSTRAINT "quarter_dependencies_goal_fk" FOREIGN KEY ("depends_on_goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_kpis" ADD CONSTRAINT "quarter_kpis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_kpis" ADD CONSTRAINT "quarter_kpis_quarter_fk" FOREIGN KEY ("quarter_id","user_id") REFERENCES "public"."roadmap_quarters"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_risks" ADD CONSTRAINT "quarter_risks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarter_risks" ADD CONSTRAINT "quarter_risks_quarter_fk" FOREIGN KEY ("quarter_id","user_id") REFERENCES "public"."roadmap_quarters"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_quarters" ADD CONSTRAINT "roadmap_quarters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_quarters" ADD CONSTRAINT "roadmap_quarters_journey_fk" FOREIGN KEY ("journey_id","user_id") REFERENCES "public"."journeys"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_years" ADD CONSTRAINT "roadmap_years_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_years" ADD CONSTRAINT "roadmap_years_journey_fk" FOREIGN KEY ("journey_id","user_id") REFERENCES "public"."journeys"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quarter_deliverables_quarter_idx" ON "quarter_deliverables" USING btree ("quarter_id");--> statement-breakpoint
CREATE INDEX "quarter_deliverables_goal_idx" ON "quarter_deliverables" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "quarter_dependencies_quarter_idx" ON "quarter_dependencies" USING btree ("quarter_id");--> statement-breakpoint
CREATE INDEX "quarter_kpis_quarter_idx" ON "quarter_kpis" USING btree ("quarter_id");--> statement-breakpoint
CREATE INDEX "quarter_risks_quarter_idx" ON "quarter_risks" USING btree ("quarter_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_weekly_capacity_check" CHECK ("profiles"."weekly_capacity_hours" between 0 and 120);--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_key_results_scale_check" CHECK ("goals"."measurement_mode" <> 'key_results' or ("goals"."unit" = 'percent' and "goals"."baseline_value" = 0 and "goals"."target_value" = 100));--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_key_result_shape_check" CHECK (not "goals"."is_key_result" or ("goals"."parent_id" is not null and "goals"."measurement_mode" <> 'key_results'));--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_estimated_hours_check" CHECK ("goals"."estimated_hours" is null or "goals"."estimated_hours" >= 0);--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_measurement_mode_check" CHECK ("goals"."measurement_mode" in ('latest', 'cumulative', 'key_results'));