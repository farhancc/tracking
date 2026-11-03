CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"track_id" uuid NOT NULL,
	"prospect_id" uuid,
	"title" text NOT NULL,
	"stage" text DEFAULT 'qualified' NOT NULL,
	"amount" numeric(20, 2),
	"currency" char(3) NOT NULL,
	"quoted_on" date,
	"expected_close_on" date,
	"closed_on" date,
	"lost_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "deals_stage_check" CHECK ("deals"."stage" in ('qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
	CONSTRAINT "deals_closed_check" CHECK (("deals"."stage" in ('won', 'lost')) = ("deals"."closed_on" is not null)),
	CONSTRAINT "deals_won_amount_check" CHECK ("deals"."stage" <> 'won' or ("deals"."amount" is not null and "deals"."amount" > 0)),
	CONSTRAINT "deals_amount_check" CHECK ("deals"."amount" is null or "deals"."amount" >= 0),
	CONSTRAINT "deals_currency_check" CHECK ("deals"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "deals_title_check" CHECK (length(btrim("deals"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"track_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"role" text,
	"email" text,
	"phone" text,
	"source" text,
	"status" text DEFAULT 'new' NOT NULL,
	"next_follow_up_on" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "prospects_status_check" CHECK ("prospects"."status" in ('new', 'contacted', 'connected', 'qualified', 'meeting', 'proposal', 'won', 'lost', 'nurture', 'disqualified')),
	CONSTRAINT "prospects_name_check" CHECK (length(btrim("prospects"."name")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "sales_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"track_id" uuid NOT NULL,
	"prospect_id" uuid,
	"deal_id" uuid,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'phone' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_on" date NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"reached_decision_maker" boolean DEFAULT false NOT NULL,
	"qualified" boolean DEFAULT false NOT NULL,
	"meeting_booked" boolean DEFAULT false NOT NULL,
	"amount" numeric(20, 2),
	"currency" char(3),
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_activities_kind_check" CHECK ("sales_activities"."kind" in ('prospecting', 'cold_call', 'follow_up', 'meeting', 'quotation')),
	CONSTRAINT "sales_activities_channel_check" CHECK ("sales_activities"."channel" in ('phone', 'email', 'linkedin', 'whatsapp', 'in_person', 'other')),
	CONSTRAINT "sales_activities_outcome_ladder_check" CHECK ((not "sales_activities"."reached_decision_maker" or "sales_activities"."connected") and (not "sales_activities"."qualified" or "sales_activities"."connected") and (not "sales_activities"."meeting_booked" or "sales_activities"."connected")),
	CONSTRAINT "sales_activities_amount_check" CHECK (("sales_activities"."amount" is null) = ("sales_activities"."currency" is null) and ("sales_activities"."amount" is null or ("sales_activities"."kind" = 'quotation' and "sales_activities"."amount" >= 0))),
	CONSTRAINT "sales_activities_duration_check" CHECK ("sales_activities"."duration_minutes" is null or "sales_activities"."duration_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "sales_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"track_id" uuid,
	"prospect_id" uuid,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"situation" text,
	"response" text,
	"worked" boolean,
	"lesson" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_journal_kind_check" CHECK ("sales_journal_entries"."kind" in ('objection', 'successful_response', 'rejected_prospect', 'successful_conversation', 'mistake', 'lesson')),
	CONSTRAINT "sales_journal_title_check" CHECK (length(btrim("sales_journal_entries"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "sales_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"track_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"target_value" numeric(20, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_targets_unique_key" UNIQUE("track_id","metric","period","effective_from"),
	CONSTRAINT "sales_targets_metric_check" CHECK ("sales_targets"."metric" in ('prospecting_attempts', 'cold_calls', 'calls_connected', 'decision_makers_reached', 'qualified_leads', 'follow_ups', 'meetings_booked', 'quotations_sent', 'deals_closed', 'revenue', 'lost_deals')),
	CONSTRAINT "sales_targets_period_check" CHECK ("sales_targets"."period" in ('day', 'week', 'month', 'quarter')),
	CONSTRAINT "sales_targets_value_check" CHECK ("sales_targets"."target_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"currency" char(3) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_tracks_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "sales_tracks_user_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "sales_tracks_currency_check" CHECK ("sales_tracks"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "sales_tracks_name_check" CHECK (length(btrim("sales_tracks"."name")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_track_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."sales_tracks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_prospect_fk" FOREIGN KEY ("prospect_id","user_id") REFERENCES "public"."prospects"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_track_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."sales_tracks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_track_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."sales_tracks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_prospect_fk" FOREIGN KEY ("prospect_id","user_id") REFERENCES "public"."prospects"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_deal_fk" FOREIGN KEY ("deal_id","user_id") REFERENCES "public"."deals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_journal_entries" ADD CONSTRAINT "sales_journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_journal_entries" ADD CONSTRAINT "sales_journal_track_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."sales_tracks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_journal_entries" ADD CONSTRAINT "sales_journal_prospect_fk" FOREIGN KEY ("prospect_id","user_id") REFERENCES "public"."prospects"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_track_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."sales_tracks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_tracks" ADD CONSTRAINT "sales_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_user_closed_idx" ON "deals" USING btree ("user_id","closed_on");--> statement-breakpoint
CREATE INDEX "prospects_user_follow_up_idx" ON "prospects" USING btree ("user_id","next_follow_up_on");--> statement-breakpoint
CREATE INDEX "sales_activities_user_day_idx" ON "sales_activities" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "sales_activities_track_day_idx" ON "sales_activities" USING btree ("track_id","occurred_on");--> statement-breakpoint
CREATE INDEX "sales_journal_user_day_idx" ON "sales_journal_entries" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tracks_one_default" ON "sales_tracks" USING btree ("user_id") WHERE "sales_tracks"."is_default";