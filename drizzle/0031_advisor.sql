CREATE TABLE "advisor_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"question_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advisor_proposals_kind_check" CHECK ("advisor_proposals"."kind" in ('update_goal', 'archive_goal', 'create_task', 'delete_task')),
	CONSTRAINT "advisor_proposals_status_check" CHECK ("advisor_proposals"."status" in ('pending', 'confirmed', 'rejected', 'failed')),
	CONSTRAINT "advisor_proposals_decided_check" CHECK (("advisor_proposals"."status" = 'pending') = ("advisor_proposals"."decided_at" is null))
);
--> statement-breakpoint
CREATE TABLE "advisor_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb,
	"tool_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advisor_questions_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "advisor_questions_question_check" CHECK (length(btrim("advisor_questions"."question")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "advisor_proposals" ADD CONSTRAINT "advisor_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_proposals" ADD CONSTRAINT "advisor_proposals_question_fk" FOREIGN KEY ("question_id","user_id") REFERENCES "public"."advisor_questions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_questions" ADD CONSTRAINT "advisor_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advisor_proposals_user_status_idx" ON "advisor_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "advisor_questions_user_created_idx" ON "advisor_questions" USING btree ("user_id","created_at");