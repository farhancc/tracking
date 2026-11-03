CREATE TABLE "audience_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"platform" text NOT NULL,
	"captured_on" date NOT NULL,
	"followers" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_snapshots_user_platform_date_key" UNIQUE("user_id","platform","captured_on"),
	CONSTRAINT "audience_snapshots_platform_check" CHECK ("audience_snapshots"."platform" in ('instagram', 'youtube', 'linkedin')),
	CONSTRAINT "audience_snapshots_followers_check" CHECK ("audience_snapshots"."followers" >= 0)
);
--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "content_item_id" uuid;--> statement-breakpoint
ALTER TABLE "content_metrics" ADD COLUMN "platform_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_snapshots" ADD CONSTRAINT "audience_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_content_item_fk" FOREIGN KEY ("content_item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospects_user_content_idx" ON "prospects" USING btree ("user_id","content_item_id");