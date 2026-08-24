ALTER TYPE "paldora"."activity_event_type" ADD VALUE 'comment.reaction.set';--> statement-breakpoint
ALTER TYPE "paldora"."notification_type" ADD VALUE 'comment.reaction';--> statement-breakpoint
CREATE TABLE "paldora"."comment_reactions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "comment_reactions_kind_length_check" CHECK (char_length("paldora"."comment_reactions"."kind") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "paldora"."comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "paldora"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reactions_comment_kind_index" ON "paldora"."comment_reactions" USING btree ("comment_id","kind");--> statement-breakpoint
CREATE INDEX "comment_reactions_user_index" ON "paldora"."comment_reactions" USING btree ("user_id","updated_at" DESC NULLS LAST);