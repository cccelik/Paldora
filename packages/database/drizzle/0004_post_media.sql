CREATE TABLE "paldora"."post_media" (
	"post_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "post_media_post_id_position_pk" PRIMARY KEY("post_id","position"),
	CONSTRAINT "post_media_position_check" CHECK ("paldora"."post_media"."position" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."posts" DROP CONSTRAINT "posts_content_lifecycle_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD COLUMN "box_id" uuid;--> statement-breakpoint
ALTER TABLE "paldora"."post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."post_media" ADD CONSTRAINT "post_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "paldora"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_asset_unique" ON "paldora"."post_media" USING btree ("media_asset_id");--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_box_index" ON "paldora"."media_assets" USING btree ("box_id") WHERE "paldora"."media_assets"."box_id" is not null;--> statement-breakpoint
CREATE INDEX "media_assets_unattached_index" ON "paldora"."media_assets" USING btree ("updated_at") WHERE "paldora"."media_assets"."purpose" = 'post_image' and "paldora"."media_assets"."status" = 'ready';--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_box_scope_check" CHECK (("paldora"."media_assets"."purpose" = 'avatar' and "paldora"."media_assets"."box_id" is null)
        or ("paldora"."media_assets"."purpose" = 'post_image' and ("paldora"."media_assets"."box_id" is not null or "paldora"."media_assets"."status" = 'deleted')));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image'));--> statement-breakpoint
ALTER TABLE "paldora"."posts" ADD CONSTRAINT "posts_content_lifecycle_check" CHECK (("paldora"."posts"."status" = 'active' and ("paldora"."posts"."content" is null or char_length("paldora"."posts"."content") between 1 and 5000))
        or ("paldora"."posts"."status" = 'deleted' and "paldora"."posts"."content" is null and "paldora"."posts"."deleted_at" is not null));