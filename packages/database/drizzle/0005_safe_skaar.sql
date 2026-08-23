ALTER TYPE "paldora"."media_status" ADD VALUE 'processing' BEFORE 'ready';--> statement-breakpoint
CREATE TABLE "paldora"."post_media" (
	"media_asset_id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_media_position_check" CHECK ("paldora"."post_media"."position" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_avatar_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."posts" DROP CONSTRAINT "posts_content_state_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "box_id" uuid;--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "display_object_key" text;--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "thumbnail_object_key" text;--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "paldora"."post_media" ADD CONSTRAINT "post_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "paldora"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_post_position_unique" ON "paldora"."post_media" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "post_media_post_index" ON "paldora"."post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "media_assets_box_status_index" ON "paldora"."media_assets" USING btree ("box_id","status");--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image'));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_box_check" CHECK (("paldora"."media_assets"."purpose" = 'avatar' and "paldora"."media_assets"."box_id" is null) or ("paldora"."media_assets"."purpose" = 'post_image' and "paldora"."media_assets"."box_id" is not null));--> statement-breakpoint
ALTER TABLE "paldora"."posts" ADD CONSTRAINT "posts_content_state_check" CHECK (("paldora"."posts"."status" = 'active' and char_length("paldora"."posts"."content") between 0 and 5000) or ("paldora"."posts"."status" = 'deleted' and "paldora"."posts"."content" = ''));