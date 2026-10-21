CREATE TABLE "paldora"."account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "account_deletion_status_check" CHECK ("paldora"."account_deletion_requests"."status" in ('pending', 'blocked', 'erasing', 'cancelled', 'completed')),
	CONSTRAINT "account_deletion_due_check" CHECK ("paldora"."account_deletion_requests"."due_at" >= "paldora"."account_deletion_requests"."requested_at" + interval '7 days'),
	CONSTRAINT "account_deletion_lifecycle_check" CHECK (("paldora"."account_deletion_requests"."status" in ('pending', 'blocked', 'erasing') and "paldora"."account_deletion_requests"."user_id" is not null and "paldora"."account_deletion_requests"."cancelled_at" is null and "paldora"."account_deletion_requests"."completed_at" is null) or ("paldora"."account_deletion_requests"."status" = 'cancelled' and "paldora"."account_deletion_requests"."cancelled_at" is not null and "paldora"."account_deletion_requests"."completed_at" is null) or ("paldora"."account_deletion_requests"."status" = 'completed' and "paldora"."account_deletion_requests"."completed_at" is not null and "paldora"."account_deletion_requests"."cancelled_at" is null))
);--> statement-breakpoint
ALTER TABLE "paldora"."account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_one_live" ON "paldora"."account_deletion_requests" USING btree ("user_id") WHERE "paldora"."account_deletion_requests"."status" in ('pending', 'blocked', 'erasing');--> statement-breakpoint
CREATE INDEX "account_deletion_due_index" ON "paldora"."account_deletion_requests" USING btree ("next_attempt_at") WHERE "paldora"."account_deletion_requests"."status" in ('pending', 'blocked');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "paldora"."reject_pending_deletion_ownership"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "paldora"."users" WHERE id = NEW.user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "paldora"."account_deletion_requests" d WHERE d.user_id = NEW.user_id AND d.status IN ('pending', 'blocked', 'erasing')) THEN
    RAISE EXCEPTION 'account deletion pending' USING ERRCODE = '23514', CONSTRAINT = 'account_deletion_ownership_guard';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "box_memberships_deletion_guard" BEFORE INSERT OR UPDATE OF role, user_id, status ON "paldora"."box_memberships" FOR EACH ROW WHEN (NEW.role = 'owner' AND NEW.status = 'active') EXECUTE FUNCTION "paldora"."reject_pending_deletion_ownership"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "paldora"."reject_pending_deletion_media"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "paldora"."users" WHERE id = NEW.owner_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "paldora"."account_deletion_requests" d WHERE d.user_id = NEW.owner_user_id AND d.status IN ('pending', 'blocked', 'erasing')) THEN
    RAISE EXCEPTION 'account deletion pending' USING ERRCODE = '23514', CONSTRAINT = 'account_deletion_media_guard';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "media_assets_deletion_guard" BEFORE INSERT OR UPDATE OF owner_user_id ON "paldora"."media_assets" FOR EACH ROW EXECUTE FUNCTION "paldora"."reject_pending_deletion_media"();
