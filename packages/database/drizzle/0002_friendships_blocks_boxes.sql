CREATE TYPE "paldora"."box_invitation_status" AS ENUM('pending', 'accepted', 'declined', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "paldora"."box_membership_status" AS ENUM('active', 'left', 'removed');--> statement-breakpoint
CREATE TYPE "paldora"."box_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "paldora"."box_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "paldora"."friendship_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "paldora"."box_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"invitee_user_id" uuid NOT NULL,
	"status" "paldora"."box_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_invitations_distinct_users_check" CHECK ("paldora"."box_invitations"."inviter_user_id" <> "paldora"."box_invitations"."invitee_user_id"),
	CONSTRAINT "box_invitations_responded_check" CHECK (case "paldora"."box_invitations"."status"
        when 'pending' then "paldora"."box_invitations"."responded_at" is null
        when 'expired' then true
        else "paldora"."box_invitations"."responded_at" is not null
      end)
);
--> statement-breakpoint
CREATE TABLE "paldora"."box_memberships" (
	"box_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "paldora"."box_role" DEFAULT 'member' NOT NULL,
	"status" "paldora"."box_membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_memberships_box_id_user_id_pk" PRIMARY KEY("box_id","user_id"),
	CONSTRAINT "box_memberships_inactive_role_check" CHECK ("paldora"."box_memberships"."status" = 'active' or "paldora"."box_memberships"."role" = 'member')
);
--> statement-breakpoint
CREATE TABLE "paldora"."boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"privacy_mode" text DEFAULT 'private' NOT NULL,
	"status" "paldora"."box_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boxes_name_length_check" CHECK (char_length("paldora"."boxes"."name") between 1 and 80),
	CONSTRAINT "boxes_private_check" CHECK ("paldora"."boxes"."privacy_mode" = 'private')
);
--> statement-breakpoint
CREATE TABLE "paldora"."friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_low_id" uuid NOT NULL,
	"user_high_id" uuid NOT NULL,
	"initiated_by_user_id" uuid NOT NULL,
	"status" "paldora"."friendship_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_canonical_pair_check" CHECK ("paldora"."friendships"."user_low_id" < "paldora"."friendships"."user_high_id"),
	CONSTRAINT "friendships_initiator_is_party_check" CHECK ("paldora"."friendships"."initiated_by_user_id" in ("paldora"."friendships"."user_low_id", "paldora"."friendships"."user_high_id"))
);
--> statement-breakpoint
CREATE TABLE "paldora"."user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_distinct_check" CHECK ("paldora"."user_blocks"."blocker_id" <> "paldora"."user_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "paldora"."box_invitations" ADD CONSTRAINT "box_invitations_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."box_invitations" ADD CONSTRAINT "box_invitations_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."box_invitations" ADD CONSTRAINT "box_invitations_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."box_memberships" ADD CONSTRAINT "box_memberships_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."box_memberships" ADD CONSTRAINT "box_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."friendships" ADD CONSTRAINT "friendships_user_low_id_users_id_fk" FOREIGN KEY ("user_low_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."friendships" ADD CONSTRAINT "friendships_user_high_id_users_id_fk" FOREIGN KEY ("user_high_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."friendships" ADD CONSTRAINT "friendships_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paldora"."user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "box_invitations_pending_pair_unique" ON "paldora"."box_invitations" USING btree ("box_id","invitee_user_id") WHERE "paldora"."box_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "box_invitations_invitee_status_index" ON "paldora"."box_invitations" USING btree ("invitee_user_id","status");--> statement-breakpoint
CREATE INDEX "box_invitations_box_status_index" ON "paldora"."box_invitations" USING btree ("box_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "box_memberships_one_owner_per_box" ON "paldora"."box_memberships" USING btree ("box_id") WHERE "paldora"."box_memberships"."role" = 'owner' and "paldora"."box_memberships"."status" = 'active';--> statement-breakpoint
CREATE INDEX "box_memberships_user_status_index" ON "paldora"."box_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "box_memberships_box_status_index" ON "paldora"."box_memberships" USING btree ("box_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "paldora"."friendships" USING btree ("user_low_id","user_high_id");--> statement-breakpoint
CREATE INDEX "friendships_low_status_index" ON "paldora"."friendships" USING btree ("user_low_id","status");--> statement-breakpoint
CREATE INDEX "friendships_high_status_index" ON "paldora"."friendships" USING btree ("user_high_id","status");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_index" ON "paldora"."user_blocks" USING btree ("blocked_id");