ALTER TABLE "paldora"."posts" ADD COLUMN "moderation_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "paldora"."comments" ADD COLUMN "moderation_hidden" boolean DEFAULT false NOT NULL;
