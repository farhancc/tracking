CREATE TABLE "psych_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"concept_id" uuid NOT NULL,
	"applied_on" date NOT NULL,
	"context" text NOT NULL,
	"action" text,
	"result" text,
	"outcome" text DEFAULT 'inconclusive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psych_applications_outcome_check" CHECK ("psych_applications"."outcome" in ('worked', 'mixed', 'did_not_work', 'inconclusive')),
	CONSTRAINT "psych_applications_context_check" CHECK (length(btrim("psych_applications"."context")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "psych_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"category" text NOT NULL,
	"concept" text NOT NULL,
	"explanation" text NOT NULL,
	"source_title" text,
	"source_author" text,
	"source_url" text,
	"source_type" text DEFAULT 'popular_book' NOT NULL,
	"evidence_level" text DEFAULT 'practitioner' NOT NULL,
	"evidence_notes" text,
	"example" text,
	"ethics" text,
	"where_to_apply" text,
	"observations" text,
	"takeaways" text,
	"understanding" text DEFAULT 'new' NOT NULL,
	"learned_on" date NOT NULL,
	"sr_ease" numeric(4, 2) DEFAULT 2.5 NOT NULL,
	"sr_interval_days" integer DEFAULT 0 NOT NULL,
	"sr_repetitions" integer DEFAULT 0 NOT NULL,
	"sr_lapses" integer DEFAULT 0 NOT NULL,
	"sr_due_on" date NOT NULL,
	"last_reviewed_on" date,
	"last_rating" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psych_concepts_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "psych_concepts_category_check" CHECK ("psych_concepts"."category" in ('consumer_psychology', 'cognitive_biases', 'persuasion', 'influence', 'decision_making', 'negotiation_psychology', 'emotional_intelligence', 'trust_building', 'social_dynamics', 'behavioural_economics')),
	CONSTRAINT "psych_concepts_evidence_check" CHECK ("psych_concepts"."evidence_level" in ('strong', 'moderate', 'limited', 'practitioner', 'speculative')),
	CONSTRAINT "psych_concepts_source_type_check" CHECK ("psych_concepts"."source_type" in ('peer_reviewed', 'academic_book', 'popular_book', 'article', 'video', 'podcast', 'course', 'observation')),
	CONSTRAINT "psych_concepts_understanding_check" CHECK ("psych_concepts"."understanding" in ('new', 'learning', 'understood', 'deep', 'needs_study')),
	CONSTRAINT "psych_concepts_concept_check" CHECK (length(btrim("psych_concepts"."concept")) between 1 and 200),
	CONSTRAINT "psych_concepts_explanation_check" CHECK (length(btrim("psych_concepts"."explanation")) between 1 and 20000),
	CONSTRAINT "psych_concepts_url_check" CHECK ("psych_concepts"."source_url" is null or "psych_concepts"."source_url" ~ '^https?://'),
	CONSTRAINT "psych_concepts_sr_check" CHECK ("psych_concepts"."sr_ease" >= 1.3 and "psych_concepts"."sr_interval_days" >= 0 and "psych_concepts"."sr_repetitions" >= 0 and "psych_concepts"."sr_lapses" >= 0)
);
--> statement-breakpoint
CREATE TABLE "psych_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"concept_id" uuid NOT NULL,
	"reviewed_on" date NOT NULL,
	"rating" text NOT NULL,
	"interval_before" integer NOT NULL,
	"interval_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psych_reviews_rating_check" CHECK ("psych_reviews"."rating" in ('again', 'hard', 'good', 'easy'))
);
--> statement-breakpoint
ALTER TABLE "psych_applications" ADD CONSTRAINT "psych_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psych_applications" ADD CONSTRAINT "psych_applications_concept_fk" FOREIGN KEY ("concept_id","user_id") REFERENCES "public"."psych_concepts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psych_concepts" ADD CONSTRAINT "psych_concepts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psych_reviews" ADD CONSTRAINT "psych_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psych_reviews" ADD CONSTRAINT "psych_reviews_concept_fk" FOREIGN KEY ("concept_id","user_id") REFERENCES "public"."psych_concepts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "psych_applications_concept_idx" ON "psych_applications" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "psych_concepts_user_due_idx" ON "psych_concepts" USING btree ("user_id","sr_due_on");--> statement-breakpoint
CREATE INDEX "psych_reviews_user_day_idx" ON "psych_reviews" USING btree ("user_id","reviewed_on");--> statement-breakpoint
CREATE INDEX "psych_reviews_concept_idx" ON "psych_reviews" USING btree ("concept_id");