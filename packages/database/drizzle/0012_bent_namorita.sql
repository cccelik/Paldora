CREATE TYPE "paldora"."life_update_audience" AS ENUM('box', 'only_me');--> statement-breakpoint
CREATE TYPE "paldora"."life_update_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TABLE "paldora"."life_update_deliveries" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"life_update_id" uuid NOT NULL,
	"audience" "paldora"."life_update_audience" NOT NULL,
	"box_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_update_deliveries_audience_box_check" CHECK (("paldora"."life_update_deliveries"."audience" = 'box' and "paldora"."life_update_deliveries"."box_id" is not null) or ("paldora"."life_update_deliveries"."audience" = 'only_me' and "paldora"."life_update_deliveries"."box_id" is null))
);
--> statement-breakpoint
CREATE TABLE "paldora"."life_update_media" (
	"media_asset_id" uuid PRIMARY KEY NOT NULL,
	"life_update_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_update_media_position_check" CHECK ("paldora"."life_update_media"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "paldora"."life_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"status" "paldora"."life_update_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_updates_deleted_at_state_check" CHECK (("paldora"."life_updates"."status" = 'deleted') = ("paldora"."life_updates"."deleted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_box_check";--> statement-breakpoint
ALTER TABLE "paldora"."posts" ALTER COLUMN "box_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "paldora"."life_update_deliveries" ADD CONSTRAINT "life_update_deliveries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "paldora"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."life_update_deliveries" ADD CONSTRAINT "life_update_deliveries_life_update_id_life_updates_id_fk" FOREIGN KEY ("life_update_id") REFERENCES "paldora"."life_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."life_update_deliveries" ADD CONSTRAINT "life_update_deliveries_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."life_update_media" ADD CONSTRAINT "life_update_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "paldora"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."life_update_media" ADD CONSTRAINT "life_update_media_life_update_id_life_updates_id_fk" FOREIGN KEY ("life_update_id") REFERENCES "paldora"."life_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."life_updates" ADD CONSTRAINT "life_updates_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "life_update_deliveries_box_unique" ON "paldora"."life_update_deliveries" USING btree ("life_update_id","box_id") WHERE "paldora"."life_update_deliveries"."audience" = 'box';--> statement-breakpoint
CREATE UNIQUE INDEX "life_update_deliveries_only_me_unique" ON "paldora"."life_update_deliveries" USING btree ("life_update_id") WHERE "paldora"."life_update_deliveries"."audience" = 'only_me';--> statement-breakpoint
CREATE INDEX "life_update_deliveries_life_update_index" ON "paldora"."life_update_deliveries" USING btree ("life_update_id");--> statement-breakpoint
CREATE UNIQUE INDEX "life_update_media_position_unique" ON "paldora"."life_update_media" USING btree ("life_update_id","position");--> statement-breakpoint
CREATE INDEX "life_update_media_life_update_index" ON "paldora"."life_update_media" USING btree ("life_update_id");--> statement-breakpoint
CREATE INDEX "life_updates_author_chronological_index" ON "paldora"."life_updates" USING btree ("author_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image', 'reaction_image', 'life_update_image'));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_box_check" CHECK (("paldora"."media_assets"."purpose" in ('avatar', 'life_update_image') and "paldora"."media_assets"."box_id" is null) or ("paldora"."media_assets"."purpose" in ('post_image', 'reaction_image') and "paldora"."media_assets"."box_id" is not null));
