CREATE TYPE "paldora"."appearance_preference" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "paldora"."room_layout" AS ENUM('single', 'two_column');--> statement-breakpoint
CREATE TYPE "paldora"."room_visibility" AS ENUM('friends', 'members', 'hidden');--> statement-breakpoint
CREATE TYPE "paldora"."room_widget_placement" AS ENUM('main', 'sidebar');--> statement-breakpoint
CREATE TYPE "paldora"."top_friends_visibility" AS ENUM('visible', 'friends', 'hidden');--> statement-breakpoint
CREATE TABLE "paldora"."room_top_friends" (
	"room_user_id" uuid NOT NULL,
	"friend_user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_top_friends_room_user_id_friend_user_id_pk" PRIMARY KEY("room_user_id","friend_user_id"),
	CONSTRAINT "room_top_friends_position_check" CHECK ("paldora"."room_top_friends"."position" between 0 and 11),
	CONSTRAINT "room_top_friends_not_self_check" CHECK ("paldora"."room_top_friends"."room_user_id" <> "paldora"."room_top_friends"."friend_user_id")
);
--> statement-breakpoint
CREATE TABLE "paldora"."room_widgets" (
	"room_user_id" uuid NOT NULL,
	"widget_type" text NOT NULL,
	"placement" "paldora"."room_widget_placement" NOT NULL,
	"position" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_widgets_room_user_id_widget_type_pk" PRIMARY KEY("room_user_id","widget_type"),
	CONSTRAINT "room_widgets_type_check" CHECK ("paldora"."room_widgets"."widget_type" in ('currently', 'music', 'top_friends', 'photos', 'life_updates', 'posts', 'memories')),
	CONSTRAINT "room_widgets_position_check" CHECK ("paldora"."room_widgets"."position" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "paldora"."rooms" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"visibility" "paldora"."room_visibility" DEFAULT 'friends' NOT NULL,
	"theme_preset" text DEFAULT 'cream_paper' NOT NULL,
	"configuration_version" integer DEFAULT 1 NOT NULL,
	"layout" "paldora"."room_layout" DEFAULT 'two_column' NOT NULL,
	"accent" text DEFAULT 'gold' NOT NULL,
	"background" text DEFAULT 'theme' NOT NULL,
	"font" text DEFAULT 'editorial' NOT NULL,
	"decoration_pack" text DEFAULT 'tape' NOT NULL,
	"sparkles" boolean DEFAULT false NOT NULL,
	"location" text,
	"currently" text,
	"music_url" text,
	"music_title" text,
	"music_artist" text,
	"banner_media_id" uuid,
	"top_friends_size" integer DEFAULT 8 NOT NULL,
	"top_friends_visibility" "paldora"."top_friends_visibility" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_configuration_version_check" CHECK ("paldora"."rooms"."configuration_version" = 1),
	CONSTRAINT "rooms_location_length_check" CHECK ("paldora"."rooms"."location" is null or char_length("paldora"."rooms"."location") <= 120),
	CONSTRAINT "rooms_currently_length_check" CHECK ("paldora"."rooms"."currently" is null or char_length("paldora"."rooms"."currently") <= 240),
	CONSTRAINT "rooms_music_url_length_check" CHECK ("paldora"."rooms"."music_url" is null or char_length("paldora"."rooms"."music_url") <= 2048),
	CONSTRAINT "rooms_music_title_length_check" CHECK ("paldora"."rooms"."music_title" is null or char_length("paldora"."rooms"."music_title") <= 120),
	CONSTRAINT "rooms_music_artist_length_check" CHECK ("paldora"."rooms"."music_artist" is null or char_length("paldora"."rooms"."music_artist") <= 120),
	CONSTRAINT "rooms_top_friends_size_check" CHECK ("paldora"."rooms"."top_friends_size" in (4, 8, 12))
);
--> statement-breakpoint
CREATE TABLE "paldora"."user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"appearance" "paldora"."appearance_preference" DEFAULT 'system' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_check";--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" DROP CONSTRAINT "media_assets_purpose_box_check";--> statement-breakpoint
ALTER TABLE "paldora"."room_top_friends" ADD CONSTRAINT "room_top_friends_room_user_id_rooms_user_id_fk" FOREIGN KEY ("room_user_id") REFERENCES "paldora"."rooms"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."room_top_friends" ADD CONSTRAINT "room_top_friends_friend_user_id_users_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."room_widgets" ADD CONSTRAINT "room_widgets_room_user_id_rooms_user_id_fk" FOREIGN KEY ("room_user_id") REFERENCES "paldora"."rooms"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."rooms" ADD CONSTRAINT "rooms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."rooms" ADD CONSTRAINT "rooms_banner_media_id_media_assets_id_fk" FOREIGN KEY ("banner_media_id") REFERENCES "paldora"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_top_friends_position_unique" ON "paldora"."room_top_friends" USING btree ("room_user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "room_widgets_position_unique" ON "paldora"."room_widgets" USING btree ("room_user_id","position");--> statement-breakpoint
CREATE INDEX "rooms_visibility_index" ON "paldora"."rooms" USING btree ("visibility","updated_at");--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_check" CHECK ("paldora"."media_assets"."purpose" in ('avatar', 'post_image', 'reaction_image', 'life_update_image', 'room_banner'));--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_purpose_box_check" CHECK (("paldora"."media_assets"."purpose" in ('avatar', 'life_update_image', 'room_banner') and "paldora"."media_assets"."box_id" is null) or ("paldora"."media_assets"."purpose" in ('post_image', 'reaction_image') and "paldora"."media_assets"."box_id" is not null));
--> statement-breakpoint
INSERT INTO "paldora"."rooms" ("user_id")
SELECT "user_id" FROM "paldora"."profiles"
WHERE "onboarding_state" = 'complete'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "paldora"."user_preferences" ("user_id")
SELECT "user_id" FROM "paldora"."profiles"
WHERE "onboarding_state" = 'complete'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "paldora"."room_widgets" ("room_user_id", "widget_type", "placement", "position")
SELECT rooms."user_id", defaults."widget_type", defaults."placement"::"paldora"."room_widget_placement", defaults."position"
FROM "paldora"."rooms" rooms
CROSS JOIN (VALUES
  ('currently', 'sidebar', 0),
  ('music', 'sidebar', 1),
  ('top_friends', 'sidebar', 2),
  ('photos', 'sidebar', 3),
  ('life_updates', 'main', 4),
  ('posts', 'main', 5),
  ('memories', 'main', 6)
) AS defaults("widget_type", "placement", "position")
ON CONFLICT DO NOTHING;
