ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_box_check";--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD COLUMN "media_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "paldora"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_media_asset_unique" ON "paldora"."post_reactions" USING btree ("media_asset_id");--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image', 'reaction_image'));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_box_check" CHECK (("paldora"."media_assets"."purpose" = 'avatar' and "paldora"."media_assets"."box_id" is null) or ("paldora"."media_assets"."purpose" in ('post_image', 'reaction_image') and "paldora"."media_assets"."box_id" is not null));--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_real_media_check" CHECK ((("paldora"."post_reactions"."kind")::text = 'real') = ("paldora"."post_reactions"."media_asset_id" is not null));
