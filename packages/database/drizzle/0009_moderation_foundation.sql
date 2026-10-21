CREATE TYPE "paldora"."moderation_audit_event" AS ENUM('staff.granted', 'staff.revoked', 'case.viewed', 'content.hidden', 'content.restored', 'account.suspended', 'account.unsuspended');--> statement-breakpoint
CREATE TYPE "paldora"."staff_role" AS ENUM('moderator', 'administrator');--> statement-breakpoint
CREATE TABLE "paldora"."moderation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"event" "paldora"."moderation_audit_event" NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_audit_reason_check" CHECK (char_length("paldora"."moderation_audit"."reason") between 20 and 1000)
);
--> statement-breakpoint
CREATE TABLE "paldora"."staff_grants" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "paldora"."staff_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paldora"."staff_grants" ADD CONSTRAINT "staff_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_audit_idempotency_unique" ON "paldora"."moderation_audit" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "moderation_audit_subject_index" ON "paldora"."moderation_audit" USING btree ("subject_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "moderation_audit_actor_index" ON "paldora"."moderation_audit" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION "paldora"."reject_moderation_audit_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'moderation audit is append-only' USING ERRCODE = '23000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "moderation_audit_immutable_rows" BEFORE UPDATE OR DELETE ON "paldora"."moderation_audit"
FOR EACH ROW EXECUTE FUNCTION "paldora"."reject_moderation_audit_mutation"();--> statement-breakpoint
CREATE TRIGGER "moderation_audit_immutable_truncate" BEFORE TRUNCATE ON "paldora"."moderation_audit"
FOR EACH STATEMENT EXECUTE FUNCTION "paldora"."reject_moderation_audit_mutation"();
