CREATE SCHEMA IF NOT EXISTS "paldora";
--> statement-breakpoint
CREATE TYPE "paldora"."media_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "paldora"."onboarding_state" AS ENUM('username', 'profile', 'avatar', 'complete');--> statement-breakpoint
CREATE TYPE "paldora"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "paldora"."media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text DEFAULT 'avatar' NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_length" bigint NOT NULL,
	"status" "paldora"."media_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paldora"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" "paldora"."user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."profiles" ADD CONSTRAINT "profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "paldora"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_unique" ON "paldora"."media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_status_index" ON "paldora"."media_assets" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_normalized_unique" ON "paldora"."profiles" USING btree ("username_normalized") WHERE "paldora"."profiles"."username_normalized" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_unique" ON "paldora"."users" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_unique" ON "paldora"."users" USING btree ("email_normalized");
