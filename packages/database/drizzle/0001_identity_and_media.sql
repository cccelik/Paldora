CREATE TYPE "paldora"."appearance_preference" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "paldora"."media_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "paldora"."onboarding_state" AS ENUM('username', 'profile', 'avatar', 'complete');--> statement-breakpoint
CREATE TYPE "paldora"."outbox_status" AS ENUM('pending', 'published', 'completed', 'dead');--> statement-breakpoint
CREATE TYPE "paldora"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "paldora"."media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"status" "paldora"."media_status" DEFAULT 'pending' NOT NULL,
	"content_type" text NOT NULL,
	"content_length" bigint NOT NULL,
	"upload_object_key" text NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"master_object_key" text,
	"display_object_key" text,
	"thumbnail_object_key" text,
	"width" integer,
	"height" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar')),
	CONSTRAINT "media_assets_content_type_check" CHECK ("paldora"."media_assets"."content_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_assets_content_length_check" CHECK ("paldora"."media_assets"."content_length" between 1 and 10485760),
	CONSTRAINT "media_assets_ready_check" CHECK ("paldora"."media_assets"."status" <> 'ready' or ("paldora"."media_assets"."master_object_key" is not null and "paldora"."media_assets"."display_object_key" is not null and "paldora"."media_assets"."thumbnail_object_key" is not null and "paldora"."media_assets"."width" > 0 and "paldora"."media_assets"."height" > 0)),
	CONSTRAINT "media_assets_failure_reason_check" CHECK ("paldora"."media_assets"."failure_reason" is null or "paldora"."media_assets"."failure_reason" in ('upload_mismatch', 'undecodable', 'processing_exhausted', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "paldora"."media_job_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "paldora"."outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_job_outbox_job_type_check" CHECK ("paldora"."media_job_outbox"."job_type" in ('media.process', 'media.delete')),
	CONSTRAINT "media_job_outbox_payload_check" CHECK (("paldora"."media_job_outbox"."job_type" = 'media.process' and "paldora"."media_job_outbox"."payload" ? 'mediaAssetId') or ("paldora"."media_job_outbox"."job_type" = 'media.delete' and jsonb_typeof("paldora"."media_job_outbox"."payload" -> 'objectKeys') = 'array')),
	CONSTRAINT "media_job_outbox_attempts_check" CHECK ("paldora"."media_job_outbox"."attempts" >= 0),
	CONSTRAINT "media_job_outbox_completed_check" CHECK (("paldora"."media_job_outbox"."status" = 'completed') = ("paldora"."media_job_outbox"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "paldora"."profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"username" text,
	"username_normalized" text,
	"display_name" text,
	"bio" text,
	"avatar_media_id" uuid,
	"onboarding_state" "paldora"."onboarding_state" DEFAULT 'username' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_pair_check" CHECK (("paldora"."profiles"."username" is null) = ("paldora"."profiles"."username_normalized" is null)),
	CONSTRAINT "profiles_username_length_check" CHECK ("paldora"."profiles"."username" is null or char_length("paldora"."profiles"."username") between 3 and 30),
	CONSTRAINT "profiles_display_name_length_check" CHECK ("paldora"."profiles"."display_name" is null or char_length("paldora"."profiles"."display_name") between 1 and 80),
	CONSTRAINT "profiles_bio_length_check" CHECK ("paldora"."profiles"."bio" is null or char_length("paldora"."profiles"."bio") <= 500),
	CONSTRAINT "profiles_onboarding_requirements_check" CHECK (("paldora"."profiles"."onboarding_state" = 'username' or "paldora"."profiles"."username" is not null) and ("paldora"."profiles"."onboarding_state" in ('username', 'profile') or "paldora"."profiles"."display_name" is not null))
);
--> statement-breakpoint
CREATE TABLE "paldora"."user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"appearance" "paldora"."appearance_preference" DEFAULT 'system' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paldora"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" "paldora"."user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "paldora"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."profiles" ADD CONSTRAINT "profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "paldora"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_upload_object_key_unique" ON "paldora"."media_assets" USING btree ("upload_object_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_purpose_index" ON "paldora"."media_assets" USING btree ("owner_user_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_assets_pending_expiry_index" ON "paldora"."media_assets" USING btree ("upload_expires_at") WHERE "paldora"."media_assets"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "media_job_outbox_dispatch_index" ON "paldora"."media_job_outbox" USING btree ("available_at","created_at") WHERE "paldora"."media_job_outbox"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_normalized_unique" ON "paldora"."profiles" USING btree ("username_normalized") WHERE "paldora"."profiles"."username_normalized" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_unique" ON "paldora"."users" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_unique" ON "paldora"."users" USING btree ("email_normalized");