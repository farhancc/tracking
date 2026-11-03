CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_refresh_token_hash" text,
	"rotated_at" timestamp with time zone,
	"aal" smallint DEFAULT 2 NOT NULL,
	"user_agent" text,
	"ip_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"mfa_totp_secret_enc" text,
	"mfa_enabled_at" timestamp with time zone,
	"mfa_last_used_step" integer,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journeys_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "journeys_dates_check" CHECK ("journeys"."end_date" > "journeys"."start_date"),
	CONSTRAINT "journeys_status_check" CHECK ("journeys"."status" in ('planned', 'active', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "pillars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#64748b' NOT NULL,
	"weight" numeric(5, 2) DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pillars_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "pillars_user_key_key" UNIQUE("user_id","key"),
	CONSTRAINT "pillars_key_check" CHECK ("pillars"."key" ~ '^[a-z][a-z0-9_]{1,31}$'),
	CONSTRAINT "pillars_color_check" CHECK ("pillars"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT app.current_user_id() NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"base_currency" char(3) DEFAULT 'USD' NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_week_starts_on_check" CHECK ("profiles"."week_starts_on" between 0 and 6),
	CONSTRAINT "profiles_base_currency_check" CHECK ("profiles"."base_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "visions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"journey_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text DEFAULT 'Five-year vision' NOT NULL,
	"statement" text NOT NULL,
	"professional_identity" text,
	"exit_strategy" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"effective_from" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visions_journey_version_key" UNIQUE("journey_id","version"),
	CONSTRAINT "visions_version_check" CHECK ("visions"."version" >= 1),
	CONSTRAINT "visions_statement_check" CHECK (length(btrim("visions"."statement")) > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_dependencies" (
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"goal_id" uuid NOT NULL,
	"depends_on_goal_id" uuid NOT NULL,
	"is_blocking" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_dependencies_pkey" PRIMARY KEY("goal_id","depends_on_goal_id"),
	CONSTRAINT "goal_dependencies_not_self_check" CHECK ("goal_dependencies"."goal_id" <> "goal_dependencies"."depends_on_goal_id")
);
--> statement-breakpoint
CREATE TABLE "goal_links" (
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"goal_id" uuid NOT NULL,
	"related_goal_id" uuid NOT NULL,
	"kind" text DEFAULT 'related' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_links_pkey" PRIMARY KEY("goal_id","related_goal_id"),
	CONSTRAINT "goal_links_canonical_order_check" CHECK ("goal_links"."goal_id" < "goal_links"."related_goal_id"),
	CONSTRAINT "goal_links_kind_check" CHECK ("goal_links"."kind" in ('related', 'synergy', 'tradeoff'))
);
--> statement-breakpoint
CREATE TABLE "goal_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"goal_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_measurements_source_check" CHECK ("goal_measurements"."source" in ('manual', 'import', 'metric', 'system'))
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"journey_id" uuid NOT NULL,
	"parent_id" uuid,
	"level" text NOT NULL,
	"category" text,
	"pillar_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"target_date" date NOT NULL,
	"priority" smallint DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"success_metric" text NOT NULL,
	"unit" text DEFAULT 'number' NOT NULL,
	"currency" char(3),
	"measurement_mode" text DEFAULT 'latest' NOT NULL,
	"baseline_value" numeric(20, 4) DEFAULT 0 NOT NULL,
	"target_value" numeric(20, 4) NOT NULL,
	"current_value" numeric(20, 4) DEFAULT 0 NOT NULL,
	"current_value_as_of" date,
	"completion_pct" numeric(5, 1) GENERATED ALWAYS AS (case
          when target_value = baseline_value then case when current_value = target_value then 100 else 0 end
          else round(least(100, greatest(0, (current_value - baseline_value) / (target_value - baseline_value) * 100)), 1)
        end) STORED NOT NULL,
	"is_target_met" boolean GENERATED ALWAYS AS (case when target_value >= baseline_value then current_value >= target_value else current_value <= target_value end) STORED NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"achieved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "goals_level_check" CHECK ("goals"."level" in ('five_year', 'annual', 'quarterly', 'monthly', 'weekly', 'daily')),
	CONSTRAINT "goals_category_check" CHECK ("goals"."category" is null or "goals"."category" in ('financial', 'business_ownership', 'professional_identity', 'skill_mastery', 'personal_brand', 'exit_condition', 'other')),
	CONSTRAINT "goals_status_check" CHECK ("goals"."status" in ('not_started', 'in_progress', 'at_risk', 'on_hold', 'achieved', 'missed', 'abandoned')),
	CONSTRAINT "goals_unit_check" CHECK ("goals"."unit" in ('number', 'count', 'currency', 'percent', 'hours', 'boolean')),
	CONSTRAINT "goals_measurement_mode_check" CHECK ("goals"."measurement_mode" in ('latest', 'cumulative')),
	CONSTRAINT "goals_priority_check" CHECK ("goals"."priority" between 1 and 4),
	CONSTRAINT "goals_title_check" CHECK (length(btrim("goals"."title")) between 1 and 200),
	CONSTRAINT "goals_success_metric_check" CHECK (length(btrim("goals"."success_metric")) between 1 and 200),
	CONSTRAINT "goals_dates_check" CHECK ("goals"."target_date" >= "goals"."start_date"),
	CONSTRAINT "goals_not_own_parent_check" CHECK ("goals"."parent_id" is null or "goals"."parent_id" <> "goals"."id"),
	CONSTRAINT "goals_five_year_root_check" CHECK ("goals"."level" <> 'five_year' or ("goals"."parent_id" is null and "goals"."category" is not null)),
	CONSTRAINT "goals_currency_check" CHECK (("goals"."unit" = 'currency') = ("goals"."currency" is not null) and ("goals"."currency" is null or "goals"."currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "goals_boolean_values_check" CHECK ("goals"."unit" <> 'boolean' or ("goals"."baseline_value" in (0, 1) and "goals"."target_value" in (0, 1) and "goals"."measurement_mode" = 'latest'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"due_on" date,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'doing', 'done', 'cancelled')),
	CONSTRAINT "tasks_title_check" CHECK (length(btrim("tasks"."title")) between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pillars" ADD CONSTRAINT "pillars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visions" ADD CONSTRAINT "visions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visions" ADD CONSTRAINT "visions_journey_fk" FOREIGN KEY ("journey_id","user_id") REFERENCES "public"."journeys"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_depends_on_fk" FOREIGN KEY ("depends_on_goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_related_fk" FOREIGN KEY ("related_goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_measurements" ADD CONSTRAINT "goal_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_measurements" ADD CONSTRAINT "goal_measurements_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_journey_fk" FOREIGN KEY ("journey_id","user_id") REFERENCES "public"."journeys"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_pillar_fk" FOREIGN KEY ("pillar_id","user_id") REFERENCES "public"."pillars"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_fk" FOREIGN KEY ("parent_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "auth"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "journeys_one_active_per_user" ON "journeys" USING btree ("user_id") WHERE "journeys"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "visions_one_current_per_journey" ON "visions" USING btree ("journey_id") WHERE "visions"."is_current";--> statement-breakpoint
CREATE INDEX "goal_dependencies_depends_on_idx" ON "goal_dependencies" USING btree ("depends_on_goal_id");--> statement-breakpoint
CREATE INDEX "goal_links_related_idx" ON "goal_links" USING btree ("related_goal_id");--> statement-breakpoint
CREATE INDEX "goal_measurements_goal_measured_idx" ON "goal_measurements" USING btree ("goal_id","measured_on");--> statement-breakpoint
CREATE INDEX "goals_user_journey_level_idx" ON "goals" USING btree ("user_id","journey_id","level");--> statement-breakpoint
CREATE INDEX "goals_parent_idx" ON "goals" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "goals_pillar_idx" ON "goals" USING btree ("pillar_id");--> statement-breakpoint
CREATE INDEX "tasks_goal_idx" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_on");