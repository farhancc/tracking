CREATE TABLE "comm_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"skill_id" uuid NOT NULL,
	"assessed_on" date NOT NULL,
	"level" smallint NOT NULL,
	"method" text DEFAULT 'self' NOT NULL,
	"assessor" text,
	"evidence" text NOT NULL,
	"recording_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_assessments_level_check" CHECK ("comm_assessments"."level" between 1 and 10),
	CONSTRAINT "comm_assessments_method_check" CHECK ("comm_assessments"."method" in ('self', 'recording_review', 'peer', 'mentor', 'test')),
	CONSTRAINT "comm_assessments_evidence_check" CHECK (length(btrim("comm_assessments"."evidence")) between 3 and 5000)
);
--> statement-breakpoint
CREATE TABLE "comm_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"skill_id" uuid,
	"key" text,
	"title" text NOT NULL,
	"instructions" text,
	"duration_minutes" integer,
	"is_daily" boolean DEFAULT false NOT NULL,
	"wants_recording" boolean DEFAULT false NOT NULL,
	"wants_words" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_exercises_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "comm_exercises_user_key_key" UNIQUE("user_id","key"),
	CONSTRAINT "comm_exercises_title_check" CHECK (length(btrim("comm_exercises"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "comm_practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"skill_id" uuid,
	"exercise_id" uuid,
	"practiced_on" date NOT NULL,
	"duration_minutes" integer,
	"self_rating" smallint,
	"notes" text,
	"content" text,
	"words" text[] DEFAULT '{}'::text[] NOT NULL,
	"recording_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_sessions_rating_check" CHECK ("comm_practice_sessions"."self_rating" is null or "comm_practice_sessions"."self_rating" between 1 and 5),
	CONSTRAINT "comm_sessions_duration_check" CHECK ("comm_practice_sessions"."duration_minutes" is null or "comm_practice_sessions"."duration_minutes" between 0 and 600),
	CONSTRAINT "comm_sessions_target_check" CHECK ("comm_practice_sessions"."skill_id" is not null or "comm_practice_sessions"."exercise_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "comm_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_recordings_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "comm_recordings_storage_key" UNIQUE("storage_key"),
	CONSTRAINT "comm_recordings_size_check" CHECK ("comm_recordings"."size_bytes" between 1 and 5242880),
	CONSTRAINT "comm_recordings_mime_check" CHECK ("comm_recordings"."mime_type" like 'audio/%')
);
--> statement-breakpoint
CREATE TABLE "comm_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"skill_id" uuid NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_resources_kind_check" CHECK ("comm_resources"."kind" in ('book', 'course', 'video', 'podcast', 'article', 'app', 'other')),
	CONSTRAINT "comm_resources_url_check" CHECK ("comm_resources"."url" is null or "comm_resources"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "comm_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_level" smallint DEFAULT 8 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_skills_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "comm_skills_user_key_key" UNIQUE("user_id","key"),
	CONSTRAINT "comm_skills_target_check" CHECK ("comm_skills"."target_level" between 1 and 10),
	CONSTRAINT "comm_skills_name_check" CHECK (length(btrim("comm_skills"."name")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "comm_assessments" ADD CONSTRAINT "comm_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_assessments" ADD CONSTRAINT "comm_assessments_skill_fk" FOREIGN KEY ("skill_id","user_id") REFERENCES "public"."comm_skills"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_assessments" ADD CONSTRAINT "comm_assessments_recording_fk" FOREIGN KEY ("recording_id","user_id") REFERENCES "public"."comm_recordings"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_exercises" ADD CONSTRAINT "comm_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_exercises" ADD CONSTRAINT "comm_exercises_skill_fk" FOREIGN KEY ("skill_id","user_id") REFERENCES "public"."comm_skills"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_practice_sessions" ADD CONSTRAINT "comm_practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_practice_sessions" ADD CONSTRAINT "comm_sessions_skill_fk" FOREIGN KEY ("skill_id","user_id") REFERENCES "public"."comm_skills"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_practice_sessions" ADD CONSTRAINT "comm_sessions_exercise_fk" FOREIGN KEY ("exercise_id","user_id") REFERENCES "public"."comm_exercises"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_practice_sessions" ADD CONSTRAINT "comm_sessions_recording_fk" FOREIGN KEY ("recording_id","user_id") REFERENCES "public"."comm_recordings"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_recordings" ADD CONSTRAINT "comm_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_resources" ADD CONSTRAINT "comm_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_resources" ADD CONSTRAINT "comm_resources_skill_fk" FOREIGN KEY ("skill_id","user_id") REFERENCES "public"."comm_skills"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_skills" ADD CONSTRAINT "comm_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comm_assessments_skill_day_idx" ON "comm_assessments" USING btree ("skill_id","assessed_on");--> statement-breakpoint
CREATE INDEX "comm_sessions_user_day_idx" ON "comm_practice_sessions" USING btree ("user_id","practiced_on");--> statement-breakpoint
CREATE INDEX "comm_sessions_skill_idx" ON "comm_practice_sessions" USING btree ("skill_id");