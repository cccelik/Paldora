ALTER TABLE "paldora"."post_reactions" DROP CONSTRAINT "post_reactions_real_media_check";--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ALTER COLUMN "kind" SET DATA TYPE text USING CASE "kind"::text
  WHEN 'like' THEN '👍'
  WHEN 'love' THEN '❤️'
  WHEN 'laugh' THEN '😂'
  WHEN 'wow' THEN '😮'
  WHEN 'sad' THEN '😢'
  WHEN 'support' THEN '🙏'
  ELSE "kind"::text
END;--> statement-breakpoint
ALTER TABLE "paldora"."profiles" ADD COLUMN "reaction_presets" jsonb DEFAULT '["👍","❤️","😂","😮","😢"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_real_media_check" CHECK (("paldora"."post_reactions"."kind" = 'real') = ("paldora"."post_reactions"."media_asset_id" is not null));--> statement-breakpoint
ALTER TABLE "paldora"."post_reactions" ADD CONSTRAINT "post_reactions_kind_length_check" CHECK (char_length("paldora"."post_reactions"."kind") between 1 and 64);--> statement-breakpoint
DROP TYPE "paldora"."reaction_kind";
