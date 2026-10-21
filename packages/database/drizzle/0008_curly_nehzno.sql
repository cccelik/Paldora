CREATE TABLE "paldora"."room_custom_widgets" (
	"room_user_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"policy_version" smallint NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "room_custom_widgets_room_user_id_position_pk" PRIMARY KEY("room_user_id","position"),
	CONSTRAINT "room_custom_widgets_position_check" CHECK ("paldora"."room_custom_widgets"."position" between 0 and 2),
	CONSTRAINT "room_custom_widgets_policy_check" CHECK ("paldora"."room_custom_widgets"."policy_version" > 0),
	CONSTRAINT "room_custom_widgets_title_check" CHECK (char_length("paldora"."room_custom_widgets"."title") between 1 and 80),
	CONSTRAINT "room_custom_widgets_source_check" CHECK (octet_length("paldora"."room_custom_widgets"."source") <= 8192)
);
--> statement-breakpoint
CREATE TABLE "paldora"."room_customizations" (
	"room_user_id" uuid PRIMARY KEY NOT NULL,
	"policy_version" smallint NOT NULL,
	"css_source" text NOT NULL,
	CONSTRAINT "room_customizations_policy_check" CHECK ("paldora"."room_customizations"."policy_version" > 0),
	CONSTRAINT "room_customizations_source_check" CHECK (octet_length("paldora"."room_customizations"."css_source") <= 8192)
);
--> statement-breakpoint
ALTER TABLE "paldora"."room_custom_widgets" ADD CONSTRAINT "room_custom_widgets_room_user_id_rooms_user_id_fk" FOREIGN KEY ("room_user_id") REFERENCES "paldora"."rooms"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."room_customizations" ADD CONSTRAINT "room_customizations_room_user_id_rooms_user_id_fk" FOREIGN KEY ("room_user_id") REFERENCES "paldora"."rooms"("user_id") ON DELETE cascade ON UPDATE no action;