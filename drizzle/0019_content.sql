CREATE TABLE "brand_settings" (
	"user_id" uuid PRIMARY KEY DEFAULT app.current_user_id() NOT NULL,
	"positioning" text NOT NULL,
	"audience" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"pillar_id" uuid,
	"platform" text,
	"format" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"hook" text,
	"script" text,
	"notes" text,
	"planned_record_on" date,
	"scheduled_on" date,
	"recorded_on" date,
	"published_on" date,
	"published_url" text,
	"review_notes" text,
	"repurposed_from_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "content_items_title_check" CHECK (length(btrim("content_items"."title")) between 1 and 300),
	CONSTRAINT "content_items_status_check" CHECK ("content_items"."status" in ('idea', 'research', 'script', 'recording', 'editing', 'scheduled', 'published', 'reviewed')),
	CONSTRAINT "content_items_platform_check" CHECK ("content_items"."platform" is null or "content_items"."platform" in ('instagram', 'youtube', 'linkedin')),
	CONSTRAINT "content_items_platform_format_check" CHECK (("content_items"."platform" is null and "content_items"."format" is null) or ((platform = 'instagram' and format in ('reel', 'carousel', 'post', 'story', 'live')) or (platform = 'youtube' and format in ('long_video', 'short', 'live')) or (platform = 'linkedin' and format in ('text_post', 'document', 'video', 'article', 'newsletter')))),
	CONSTRAINT "content_items_platform_required_check" CHECK ("content_items"."status" in ('idea', 'research') or "content_items"."platform" is not null),
	CONSTRAINT "content_items_scheduled_check" CHECK ("content_items"."status" <> 'scheduled' or "content_items"."scheduled_on" is not null),
	CONSTRAINT "content_items_published_check" CHECK (("content_items"."status" in ('published', 'reviewed')) = ("content_items"."published_on" is not null)),
	CONSTRAINT "content_items_reviewed_check" CHECK ("content_items"."status" <> 'reviewed' or length(btrim(coalesce("content_items"."review_notes", ''))) > 0),
	CONSTRAINT "content_items_not_own_source_check" CHECK ("content_items"."repurposed_from_id" is null or "content_items"."repurposed_from_id" <> "content_items"."id")
);
--> statement-breakpoint
CREATE TABLE "content_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"item_id" uuid NOT NULL,
	"captured_on" date NOT NULL,
	"views" integer,
	"reach" integer,
	"impressions" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"saves" integer,
	"watch_time_minutes" numeric(14, 1),
	"avg_view_seconds" numeric(10, 1),
	"avg_retention_pct" numeric(5, 2),
	"completion_rate_pct" numeric(5, 2),
	"profile_visits" integer,
	"followers_gained" integer,
	"website_clicks" integer,
	"leads" integer,
	"sales_count" integer,
	"sales_amount" numeric(20, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_metrics_item_date_key" UNIQUE("item_id","captured_on"),
	CONSTRAINT "content_metrics_nonnegative_check" CHECK (coalesce("content_metrics"."views", 0) >= 0 and coalesce("content_metrics"."reach", 0) >= 0 and coalesce("content_metrics"."impressions", 0) >= 0 and coalesce("content_metrics"."likes", 0) >= 0
        and coalesce("content_metrics"."comments", 0) >= 0 and coalesce("content_metrics"."shares", 0) >= 0 and coalesce("content_metrics"."saves", 0) >= 0 and coalesce("content_metrics"."watch_time_minutes", 0) >= 0
        and coalesce("content_metrics"."avg_view_seconds", 0) >= 0 and coalesce("content_metrics"."profile_visits", 0) >= 0 and coalesce("content_metrics"."website_clicks", 0) >= 0
        and coalesce("content_metrics"."leads", 0) >= 0 and coalesce("content_metrics"."sales_count", 0) >= 0 and coalesce("content_metrics"."sales_amount", 0) >= 0),
	CONSTRAINT "content_metrics_pct_check" CHECK (("content_metrics"."avg_retention_pct" is null or "content_metrics"."avg_retention_pct" between 0 and 100) and ("content_metrics"."completion_rate_pct" is null or "content_metrics"."completion_rate_pct" between 0 and 100))
);
--> statement-breakpoint
CREATE TABLE "content_pillars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_pillars_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "content_pillars_user_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "content_pillars_name_check" CHECK (length(btrim("content_pillars"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_sources_title_check" CHECK (length(btrim("content_sources"."title")) between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_pillar_fk" FOREIGN KEY ("pillar_id","user_id") REFERENCES "public"."content_pillars"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_repurposed_fk" FOREIGN KEY ("repurposed_from_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_item_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillars" ADD CONSTRAINT "content_pillars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_item_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_user_status_idx" ON "content_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "content_items_user_scheduled_idx" ON "content_items" USING btree ("user_id","scheduled_on");--> statement-breakpoint
CREATE INDEX "content_items_user_published_idx" ON "content_items" USING btree ("user_id","published_on");--> statement-breakpoint
CREATE INDEX "content_metrics_user_date_idx" ON "content_metrics" USING btree ("user_id","captured_on");