CREATE TYPE "paldora"."activity_event_type" AS ENUM('comment.created', 'comment.updated', 'comment.deleted', 'reaction.set');--> statement-breakpoint
CREATE TYPE "paldora"."comment_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TYPE "paldora"."notification_type" AS ENUM('post.comment', 'comment.reply', 'post.reaction');--> statement-breakpoint
CREATE TYPE "paldora"."reaction_kind" AS ENUM('like', 'love', 'laugh', 'support');--> statement-breakpoint
CREATE TABLE "paldora"."activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "paldora"."activity_event_type" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_attempts_check" CHECK ("paldora"."activity_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "paldora"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"content" text NOT NULL,
	"status" "paldora"."comment_status" DEFAULT 'active' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_content_state_check" CHECK (("paldora"."comments"."status" = 'active' and char_length("paldora"."comments"."content") between 1 and 2000) or ("paldora"."comments"."status" = 'deleted' and "paldora"."comments"."content" = '')),
	CONSTRAINT "comments_deleted_at_state_check" CHECK (("paldora"."comments"."status" = 'deleted') = ("paldora"."comments"."deleted_at" is not null)),
	CONSTRAINT "comments_not_own_parent_check" CHECK ("paldora"."comments"."parent_comment_id" is null or "paldora"."comments"."parent_comment_id" <> "paldora"."comments"."id")
);
--> statement-breakpoint
CREATE TABLE "paldora"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"activity_event_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"type" "paldora"."notification_type" NOT NULL,
	"post_id" uuid NOT NULL,
	"comment_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_distinct_users_check" CHECK ("paldora"."notifications"."actor_user_id" <> "paldora"."notifications"."recipient_user_id")
);
--> statement-breakpoint
CREATE TABLE "paldora"."post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "paldora"."reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "paldora"."activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_activity_event_id_activity_events_id_fk" FOREIGN KEY ("activity_event_id") REFERENCES "paldora"."activity_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_dedupe_key_unique" ON "paldora"."activity_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "activity_events_pending_index" ON "paldora"."activity_events" USING btree ("available_at","created_at") WHERE "paldora"."activity_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "comments_post_root_chronological_index" ON "paldora"."comments" USING btree ("post_id","parent_comment_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_parent_chronological_index" ON "paldora"."comments" USING btree ("parent_comment_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_author_status_index" ON "paldora"."comments" USING btree ("author_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_activity_recipient_unique" ON "paldora"."notifications" USING btree ("activity_event_id","recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "paldora"."notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_chronological_index" ON "paldora"."notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_index" ON "paldora"."notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST) WHERE "paldora"."notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "post_reactions_post_kind_index" ON "paldora"."post_reactions" USING btree ("post_id","kind");--> statement-breakpoint
CREATE INDEX "post_reactions_user_index" ON "paldora"."post_reactions" USING btree ("user_id","updated_at" DESC NULLS LAST);