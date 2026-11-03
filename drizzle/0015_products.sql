CREATE TABLE "product_bugs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reported_on" date NOT NULL,
	"fixed_on" date,
	"release_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_bugs_title_check" CHECK (length(btrim("product_bugs"."title")) between 1 and 200),
	CONSTRAINT "product_bugs_severity_check" CHECK ("product_bugs"."severity" in ('critical', 'high', 'medium', 'low')),
	CONSTRAINT "product_bugs_status_check" CHECK ("product_bugs"."status" in ('open', 'in_progress', 'fixed', 'wont_fix')),
	CONSTRAINT "product_bugs_fixed_check" CHECK (("product_bugs"."status" = 'fixed') = ("product_bugs"."fixed_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "product_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" text DEFAULT 'should' NOT NULL,
	"impact" smallint,
	"effort" smallint,
	"release_id" uuid,
	"shipped_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_features_id_product_key" UNIQUE("id","product_id"),
	CONSTRAINT "product_features_title_check" CHECK (length(btrim("product_features"."title")) between 1 and 200),
	CONSTRAINT "product_features_status_check" CHECK ("product_features"."status" in ('backlog', 'planned', 'in_progress', 'shipped', 'dropped')),
	CONSTRAINT "product_features_priority_check" CHECK ("product_features"."priority" in ('must', 'should', 'could', 'wont')),
	CONSTRAINT "product_features_scores_check" CHECK (("product_features"."impact" is null or "product_features"."impact" between 1 and 5) and ("product_features"."effort" is null or "product_features"."effort" between 1 and 5)),
	CONSTRAINT "product_features_shipped_check" CHECK (("product_features"."status" = 'shipped') = ("product_features"."shipped_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "product_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"customer" text,
	"source" text DEFAULT 'other' NOT NULL,
	"kind" text NOT NULL,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"content" text NOT NULL,
	"feature_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_feedback_content_check" CHECK (length(btrim("product_feedback"."content")) between 1 and 5000),
	CONSTRAINT "product_feedback_kind_check" CHECK ("product_feedback"."kind" in ('praise', 'complaint', 'feature_request', 'bug_report', 'question', 'churn_reason')),
	CONSTRAINT "product_feedback_source_check" CHECK ("product_feedback"."source" in ('interview', 'call', 'email', 'support', 'in_app', 'review', 'social', 'other')),
	CONSTRAINT "product_feedback_sentiment_check" CHECK ("product_feedback"."sentiment" in ('positive', 'neutral', 'negative'))
);
--> statement-breakpoint
CREATE TABLE "product_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"month" date NOT NULL,
	"mrr" numeric(20, 2),
	"active_customers" integer NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"churned_customers" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_metrics_product_month_key" UNIQUE("product_id","month"),
	CONSTRAINT "product_metrics_month_check" CHECK (extract(day from "product_metrics"."month") = 1),
	CONSTRAINT "product_metrics_counts_check" CHECK ("product_metrics"."active_customers" >= 0 and "product_metrics"."new_customers" >= 0 and "product_metrics"."churned_customers" >= 0),
	CONSTRAINT "product_metrics_mrr_check" CHECK ("product_metrics"."mrr" is null or "product_metrics"."mrr" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"stage" text,
	"status" text DEFAULT 'open' NOT NULL,
	"due_on" date,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_milestones_title_check" CHECK (length(btrim("product_milestones"."title")) between 1 and 200),
	CONSTRAINT "product_milestones_status_check" CHECK ("product_milestones"."status" in ('open', 'done', 'dropped')),
	CONSTRAINT "product_milestones_done_check" CHECK (("product_milestones"."status" = 'done') = ("product_milestones"."completed_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "product_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text,
	"notes" text,
	"planned_on" date,
	"released_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_releases_id_product_key" UNIQUE("id","product_id"),
	CONSTRAINT "product_releases_product_version_key" UNIQUE("product_id","version"),
	CONSTRAINT "product_releases_version_check" CHECK (length(btrim("product_releases"."version")) between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "product_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"changed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_transactions_amount_check" CHECK ("product_transactions"."amount" > 0),
	CONSTRAINT "product_transactions_kind_check" CHECK ("product_transactions"."kind" in ('revenue', 'expense')),
	CONSTRAINT "product_transactions_category_check" CHECK ("product_transactions"."category" in ('subscription', 'one_time', 'services', 'refund', 'other_revenue', 'hosting', 'software', 'marketing', 'contractors', 'payment_fees', 'legal', 'hardware', 'other_expense')),
	CONSTRAINT "product_transactions_kind_category_check" CHECK (("product_transactions"."kind" = 'revenue') = ("product_transactions"."category" in ('subscription', 'one_time', 'services', 'refund', 'other_revenue')))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_customer" text,
	"problem" text,
	"value_proposition" text,
	"business_model" text DEFAULT 'subscription' NOT NULL,
	"pricing" text,
	"stage" text DEFAULT 'idea' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"currency" char(3) NOT NULL,
	"acquisition_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"started_on" date NOT NULL,
	"stage_entered_on" date NOT NULL,
	"planned_launch_on" date,
	"launched_on" date,
	"goal_id" uuid,
	"status_note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "products_user_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "products_name_check" CHECK (length(btrim("products"."name")) between 1 and 120),
	CONSTRAINT "products_stage_check" CHECK ("products"."stage" in ('idea', 'research', 'validation', 'mvp', 'beta', 'launch', 'growth', 'optimization')),
	CONSTRAINT "products_status_check" CHECK ("products"."status" in ('active', 'paused', 'discontinued')),
	CONSTRAINT "products_business_model_check" CHECK ("products"."business_model" in ('subscription', 'one_time', 'usage_based', 'freemium', 'marketplace', 'services', 'advertising', 'other')),
	CONSTRAINT "products_currency_check" CHECK ("products"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "products_launched_check" CHECK ("products"."stage" not in ('launch', 'growth', 'optimization') or "products"."launched_on" is not null)
);
--> statement-breakpoint
ALTER TABLE "product_bugs" ADD CONSTRAINT "product_bugs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bugs" ADD CONSTRAINT "product_bugs_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bugs" ADD CONSTRAINT "product_bugs_release_fk" FOREIGN KEY ("release_id","product_id") REFERENCES "public"."product_releases"("id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_release_fk" FOREIGN KEY ("release_id","product_id") REFERENCES "public"."product_releases"("id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_feature_fk" FOREIGN KEY ("feature_id","product_id") REFERENCES "public"."product_features"("id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_metrics" ADD CONSTRAINT "product_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_metrics" ADD CONSTRAINT "product_metrics_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_milestones" ADD CONSTRAINT "product_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_milestones" ADD CONSTRAINT "product_milestones_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transactions" ADD CONSTRAINT "product_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transactions" ADD CONSTRAINT "product_transactions_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_goal_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_bugs_product_status_idx" ON "product_bugs" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "product_feedback_product_date_idx" ON "product_feedback" USING btree ("product_id","received_on");--> statement-breakpoint
CREATE INDEX "product_stage_events_product_idx" ON "product_stage_events" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_transactions_product_date_idx" ON "product_transactions" USING btree ("product_id","occurred_on");