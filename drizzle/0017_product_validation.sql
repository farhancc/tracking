CREATE TABLE "product_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"pricing" text,
	"strengths" text,
	"weaknesses" text,
	"why_switch" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_competitors_product_name_key" UNIQUE("product_id","name"),
	CONSTRAINT "product_competitors_name_check" CHECK (length(btrim("product_competitors"."name")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "product_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"interviewed_on" date NOT NULL,
	"customer_name" text,
	"customer_type" text NOT NULL,
	"problem" text,
	"confirms_problem" boolean,
	"pain_level" smallint,
	"current_solution" text,
	"willingness" text DEFAULT 'unclear' NOT NULL,
	"stated_price" numeric(20, 2),
	"objections" text,
	"feedback" text,
	"follow_up_on" date,
	"follow_up_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_interviews_type_check" CHECK (length(btrim("product_interviews"."customer_type")) between 1 and 200),
	CONSTRAINT "product_interviews_willingness_check" CHECK ("product_interviews"."willingness" in ('none', 'unclear', 'would_consider', 'verbal_yes', 'committed', 'paid')),
	CONSTRAINT "product_interviews_pain_check" CHECK ("product_interviews"."pain_level" is null or "product_interviews"."pain_level" between 1 and 5),
	CONSTRAINT "product_interviews_price_check" CHECK ("product_interviews"."stated_price" is null or "product_interviews"."stated_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_validation_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"step" text NOT NULL,
	"kind" text NOT NULL,
	"observed_on" date NOT NULL,
	"summary" text NOT NULL,
	"value" numeric(20, 2),
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_validation_evidence_kind_check" CHECK ("product_validation_evidence"."kind" in ('observation', 'interview_summary', 'document', 'metric', 'visitors', 'signups', 'payment', 'survey', 'experiment')),
	CONSTRAINT "product_validation_evidence_summary_check" CHECK (length(btrim("product_validation_evidence"."summary")) between 1 and 5000),
	CONSTRAINT "product_validation_evidence_value_check" CHECK ("product_validation_evidence"."kind" not in ('metric', 'visitors', 'signups', 'payment') or "product_validation_evidence"."value" is not null),
	CONSTRAINT "product_validation_evidence_count_check" CHECK ("product_validation_evidence"."kind" not in ('visitors', 'signups', 'payment') or "product_validation_evidence"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_validation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"product_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"success_criteria" text NOT NULL,
	"notes" text,
	"decided_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_validation_steps_product_step_key" UNIQUE("product_id","step"),
	CONSTRAINT "product_validation_steps_step_check" CHECK ("product_validation_steps"."step" in ('problem_discovery', 'customer_interviews', 'competitor_research', 'market_validation', 'landing_page', 'presales', 'mvp_development', 'beta_testing', 'customer_feedback', 'public_launch', 'customer_acquisition', 'retention')),
	CONSTRAINT "product_validation_steps_status_check" CHECK ("product_validation_steps"."status" in ('not_started', 'in_progress', 'validated', 'invalidated')),
	CONSTRAINT "product_validation_steps_decided_check" CHECK (("product_validation_steps"."status" in ('validated', 'invalidated')) = ("product_validation_steps"."decided_on" is not null)),
	CONSTRAINT "product_validation_steps_criteria_check" CHECK (length(btrim("product_validation_steps"."success_criteria")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "product_competitors" ADD CONSTRAINT "product_competitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_competitors" ADD CONSTRAINT "product_competitors_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_interviews" ADD CONSTRAINT "product_interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_interviews" ADD CONSTRAINT "product_interviews_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_validation_evidence" ADD CONSTRAINT "product_validation_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_validation_evidence" ADD CONSTRAINT "product_validation_evidence_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_validation_evidence" ADD CONSTRAINT "product_validation_evidence_step_fk" FOREIGN KEY ("product_id","step") REFERENCES "public"."product_validation_steps"("product_id","step") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_validation_steps" ADD CONSTRAINT "product_validation_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_validation_steps" ADD CONSTRAINT "product_validation_steps_product_fk" FOREIGN KEY ("product_id","user_id") REFERENCES "public"."products"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_interviews_product_date_idx" ON "product_interviews" USING btree ("product_id","interviewed_on");--> statement-breakpoint
CREATE INDEX "product_interviews_user_follow_up_idx" ON "product_interviews" USING btree ("user_id","follow_up_on") WHERE not "product_interviews"."follow_up_done";--> statement-breakpoint
CREATE INDEX "product_validation_evidence_product_step_idx" ON "product_validation_evidence" USING btree ("product_id","step");