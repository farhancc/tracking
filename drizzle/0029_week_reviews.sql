CREATE TABLE "week_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"week_start" date NOT NULL,
	"answers" jsonb NOT NULL,
	"snapshot" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_reviews_user_week_key" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "week_reviews" ADD CONSTRAINT "week_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;