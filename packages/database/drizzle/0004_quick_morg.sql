CREATE TYPE "paldora"."post_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TABLE "paldora"."posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" "paldora"."post_status" DEFAULT 'active' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_content_state_check" CHECK (("paldora"."posts"."status" = 'active' and char_length("paldora"."posts"."content") between 1 and 5000) or ("paldora"."posts"."status" = 'deleted' and "paldora"."posts"."content" = '')),
	CONSTRAINT "posts_deleted_at_state_check" CHECK (("paldora"."posts"."status" = 'deleted') = ("paldora"."posts"."deleted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "paldora"."posts" ADD CONSTRAINT "posts_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_box_chronological_index" ON "paldora"."posts" USING btree ("box_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_author_status_index" ON "paldora"."posts" USING btree ("author_user_id","status");