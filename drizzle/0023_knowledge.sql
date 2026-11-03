CREATE TABLE "knowledge_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"resource_id" uuid NOT NULL,
	"concept_id" uuid,
	"description" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"task_id" uuid,
	"journal_entry_id" uuid,
	"result" text,
	"applied_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_applications_description_check" CHECK (length(btrim("knowledge_applications"."description")) between 1 and 2000),
	CONSTRAINT "knowledge_applications_status_check" CHECK ("knowledge_applications"."status" in ('planned', 'practising', 'done', 'dropped')),
	CONSTRAINT "knowledge_applications_done_check" CHECK ("knowledge_applications"."status" <> 'done' or "knowledge_applications"."applied_on" is not null)
);
--> statement-breakpoint
CREATE TABLE "knowledge_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"resource_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"explanation" text,
	"psych_concept_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_concepts_id_resource_key" UNIQUE("id","resource_id"),
	CONSTRAINT "knowledge_concepts_concept_check" CHECK (length(btrim("knowledge_concepts"."concept")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "knowledge_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"category" text,
	"url" text,
	"status" text DEFAULT 'want' NOT NULL,
	"started_on" date,
	"completed_on" date,
	"rating" smallint,
	"notes" text,
	"total_units" integer,
	"progress_units" integer,
	"goal_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_resources_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_resources_title_check" CHECK (length(btrim("knowledge_resources"."title")) between 1 and 300),
	CONSTRAINT "knowledge_resources_kind_check" CHECK ("knowledge_resources"."kind" in ('book', 'course', 'paper', 'podcast', 'video', 'article', 'case_study', 'observation')),
	CONSTRAINT "knowledge_resources_status_check" CHECK ("knowledge_resources"."status" in ('want', 'in_progress', 'completed', 'abandoned')),
	CONSTRAINT "knowledge_resources_completed_check" CHECK (("knowledge_resources"."status" = 'completed') = ("knowledge_resources"."completed_on" is not null)),
	CONSTRAINT "knowledge_resources_started_check" CHECK ("knowledge_resources"."status" = 'want' or "knowledge_resources"."started_on" is not null),
	CONSTRAINT "knowledge_resources_dates_check" CHECK ("knowledge_resources"."completed_on" is null or "knowledge_resources"."started_on" is null or "knowledge_resources"."completed_on" >= "knowledge_resources"."started_on"),
	CONSTRAINT "knowledge_resources_rating_check" CHECK ("knowledge_resources"."rating" is null or "knowledge_resources"."rating" between 1 and 5),
	CONSTRAINT "knowledge_resources_units_check" CHECK (("knowledge_resources"."total_units" is null or "knowledge_resources"."total_units" > 0) and ("knowledge_resources"."progress_units" is null or "knowledge_resources"."progress_units" >= 0) and ("knowledge_resources"."total_units" is null or "knowledge_resources"."progress_units" is null or "knowledge_resources"."progress_units" <= "knowledge_resources"."total_units"))
);
--> statement-breakpoint
CREATE TABLE "reading_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"year" smallint NOT NULL,
	"target_count" integer,
	"kinds" text[] DEFAULT '{book}'::text[] NOT NULL,
	"daily_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_goals_user_year_key" UNIQUE("user_id","year"),
	CONSTRAINT "reading_goals_values_check" CHECK (("reading_goals"."target_count" is null or "reading_goals"."target_count" between 1 and 1000) and ("reading_goals"."daily_minutes" is null or "reading_goals"."daily_minutes" between 1 and 1440)),
	CONSTRAINT "reading_goals_kinds_check" CHECK (cardinality("reading_goals"."kinds") >= 1 and "reading_goals"."kinds" <@ array['book', 'course', 'paper', 'podcast', 'video', 'article', 'case_study', 'observation']::text[])
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"resource_id" uuid,
	"read_on" date NOT NULL,
	"minutes" integer NOT NULL,
	"units" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_sessions_minutes_check" CHECK ("reading_sessions"."minutes" between 1 and 1440),
	CONSTRAINT "reading_sessions_units_check" CHECK ("reading_sessions"."units" is null or "reading_sessions"."units" >= 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_applications" ADD CONSTRAINT "knowledge_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_applications" ADD CONSTRAINT "knowledge_applications_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."knowledge_resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_applications" ADD CONSTRAINT "knowledge_applications_concept_fk" FOREIGN KEY ("concept_id","resource_id") REFERENCES "public"."knowledge_concepts"("id","resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_user_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "sales_journal_entries" ADD CONSTRAINT "sales_journal_id_user_key" UNIQUE("id","user_id");
ALTER TABLE "knowledge_applications" ADD CONSTRAINT "knowledge_applications_task_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_applications" ADD CONSTRAINT "knowledge_applications_journal_fk" FOREIGN KEY ("journal_entry_id","user_id") REFERENCES "public"."sales_journal_entries"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_concepts" ADD CONSTRAINT "knowledge_concepts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_concepts" ADD CONSTRAINT "knowledge_concepts_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."knowledge_resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_concepts" ADD CONSTRAINT "knowledge_concepts_psych_fk" FOREIGN KEY ("psych_concept_id","user_id") REFERENCES "public"."psych_concepts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_resources" ADD CONSTRAINT "knowledge_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_resources" ADD CONSTRAINT "knowledge_resources_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."knowledge_resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_applications_user_status_idx" ON "knowledge_applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_resources_user_status_idx" ON "knowledge_resources" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reading_sessions_user_day_idx" ON "reading_sessions" USING btree ("user_id","read_on");--> statement-breakpoint