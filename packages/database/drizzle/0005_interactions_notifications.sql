CREATE TYPE "paldora"."activity_event_status" AS ENUM('pending', 'completed', 'dead');--> statement-breakpoint
CREATE TYPE "paldora"."comment_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TABLE "paldora"."activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"comment_id" uuid,
	"dedupe_key" text NOT NULL,
	"status" "paldora"."activity_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_type_check" CHECK ("paldora"."activity_events"."type" in ('comment.created', 'post.reaction.set', 'comment.reaction.set')),
	CONSTRAINT "activity_events_comment_check" CHECK (("paldora"."activity_events"."type" = 'post.reaction.set') = ("paldora"."activity_events"."comment_id" is null)),
	CONSTRAINT "activity_events_attempts_check" CHECK ("paldora"."activity_events"."attempts" >= 0),
	CONSTRAINT "activity_events_completed_check" CHECK (("paldora"."activity_events"."status" = 'completed') = ("paldora"."activity_events"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "paldora"."comment_reactions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "comment_reactions_kind_check" CHECK (char_length("paldora"."comment_reactions"."kind") between 1 and 64 and "paldora"."comment_reactions"."kind" <> 'real')
);
--> statement-breakpoint
CREATE TABLE "paldora"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"reply_to_user_id" uuid,
	"content" text,
	"status" "paldora"."comment_status" DEFAULT 'active' NOT NULL,
	"depth" smallint GENERATED ALWAYS AS (case when parent_comment_id is null then 0 else 1 end) STORED NOT NULL,
	"parent_depth" smallint GENERATED ALWAYS AS (case when parent_comment_id is null then null else 0 end) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_id_post_depth_unique" UNIQUE("id","post_id","depth"),
	CONSTRAINT "comments_content_lifecycle_check" CHECK (("paldora"."comments"."status" = 'active' and "paldora"."comments"."content" is not null and char_length("paldora"."comments"."content") between 1 and 2000 and "paldora"."comments"."deleted_at" is null)
        or ("paldora"."comments"."status" = 'deleted' and "paldora"."comments"."content" is null and "paldora"."comments"."deleted_at" is not null)),
	CONSTRAINT "comments_reply_to_check" CHECK ("paldora"."comments"."parent_comment_id" is not null or "paldora"."comments"."reply_to_user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "paldora"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"post_id" uuid NOT NULL,
	"comment_id" uuid,
	"activity_event_id" uuid,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_distinct_people_check" CHECK ("paldora"."notifications"."recipient_user_id" <> "paldora"."notifications"."actor_user_id"),
	CONSTRAINT "notifications_type_check" CHECK ("paldora"."notifications"."type" in ('post.comment', 'comment.reply', 'post.reaction', 'comment.reaction')),
	CONSTRAINT "notifications_comment_check" CHECK (("paldora"."notifications"."type" = 'post.reaction') = ("paldora"."notifications"."comment_id" is null))
);
--> statement-breakpoint
CREATE TABLE "paldora"."post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"media_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
	CONSTRAINT "post_reactions_kind_length_check" CHECK (char_length("paldora"."post_reactions"."kind") between 1 and 64),
	CONSTRAINT "post_reactions_real_media_check" CHECK (("paldora"."post_reactions"."kind" = 'real') = ("paldora"."post_reactions"."media_asset_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_box_scope_check";--> statement-breakpoint
DROP INDEX "paldora"."media_assets_unattached_index";--> statement-breakpoint
ALTER TABLE "paldora"."user_preferences" ADD COLUMN "reaction_presets" text[] DEFAULT array['👍', '❤️', '😂', '😮', '😢']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "paldora"."activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."activity_events" ADD CONSTRAINT "activity_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."activity_events" ADD CONSTRAINT "activity_events_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_reply_to_user_id_users_id_fk" FOREIGN KEY ("reply_to_user_id") REFERENCES "paldora"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_parent_root_fk" FOREIGN KEY ("parent_comment_id","post_id","parent_depth") REFERENCES "paldora"."comments"("id","post_id","depth") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_activity_event_id_activity_events_id_fk" FOREIGN KEY ("activity_event_id") REFERENCES "paldora"."activity_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "paldora"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_dedupe_key_unique" ON "paldora"."activity_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "activity_events_claim_index" ON "paldora"."activity_events" USING btree ("available_at","created_at") WHERE "paldora"."activity_events"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "activity_events_retention_index" ON "paldora"."activity_events" USING btree ("completed_at") WHERE "paldora"."activity_events"."status" = 'completed';--> statement-breakpoint
CREATE INDEX "activity_events_actor_index" ON "paldora"."activity_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "activity_events_post_index" ON "paldora"."activity_events" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "activity_events_comment_index" ON "paldora"."activity_events" USING btree ("comment_id") WHERE "paldora"."activity_events"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "comment_reactions_comment_kind_index" ON "paldora"."comment_reactions" USING btree ("comment_id","kind");--> statement-breakpoint
CREATE INDEX "comment_reactions_user_index" ON "paldora"."comment_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_post_roots_index" ON "paldora"."comments" USING btree ("post_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "paldora"."comments"."parent_comment_id" is null;--> statement-breakpoint
CREATE INDEX "comments_replies_index" ON "paldora"."comments" USING btree ("parent_comment_id","created_at","id") WHERE "paldora"."comments"."parent_comment_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_post_active_index" ON "paldora"."comments" USING btree ("post_id") WHERE "paldora"."comments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "comments_author_index" ON "paldora"."comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "comments_reply_to_index" ON "paldora"."comments" USING btree ("reply_to_user_id") WHERE "paldora"."comments"."reply_to_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "paldora"."notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_index" ON "paldora"."notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_index" ON "paldora"."notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST) WHERE "paldora"."notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_actor_index" ON "paldora"."notifications" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "notifications_post_index" ON "paldora"."notifications" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_index" ON "paldora"."notifications" USING btree ("comment_id") WHERE "paldora"."notifications"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_activity_event_index" ON "paldora"."notifications" USING btree ("activity_event_id") WHERE "paldora"."notifications"."activity_event_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_created_index" ON "paldora"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_media_asset_unique" ON "paldora"."post_reactions" USING btree ("media_asset_id") WHERE "paldora"."post_reactions"."media_asset_id" is not null;--> statement-breakpoint
CREATE INDEX "post_reactions_post_kind_index" ON "paldora"."post_reactions" USING btree ("post_id","kind");--> statement-breakpoint
CREATE INDEX "post_reactions_user_index" ON "paldora"."post_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_reactions_real_index" ON "paldora"."post_reactions" USING btree ("post_id","created_at" DESC NULLS LAST) WHERE "paldora"."post_reactions"."kind" = 'real';--> statement-breakpoint
CREATE INDEX "media_assets_unattached_index" ON "paldora"."media_assets" USING btree ("updated_at") WHERE "paldora"."media_assets"."purpose" in ('post_image', 'reaction_image') and "paldora"."media_assets"."status" = 'ready';--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image', 'reaction_image'));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_box_scope_check" CHECK (("paldora"."media_assets"."purpose" = 'avatar' and "paldora"."media_assets"."box_id" is null)
        or ("paldora"."media_assets"."purpose" in ('post_image', 'reaction_image') and ("paldora"."media_assets"."box_id" is not null or "paldora"."media_assets"."status" = 'deleted')));--> statement-breakpoint
ALTER TABLE "paldora"."user_preferences" ADD CONSTRAINT "user_preferences_reaction_presets_check" CHECK (cardinality("paldora"."user_preferences"."reaction_presets") = 5);