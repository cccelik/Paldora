CREATE TABLE "paldora"."account_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "account_exports_status_check" CHECK ("paldora"."account_exports"."status" in ('pending', 'ready', 'expired')),
	CONSTRAINT "account_exports_ready_check" CHECK (("paldora"."account_exports"."status" = 'ready') = ("paldora"."account_exports"."object_key" is not null and "paldora"."account_exports"."ready_at" is not null and "paldora"."account_exports"."expires_at" is not null))
);--> statement-breakpoint
ALTER TABLE "paldora"."account_exports" ADD CONSTRAINT "account_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "paldora"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_exports_one_pending" ON "paldora"."account_exports" USING btree ("user_id") WHERE "paldora"."account_exports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "account_exports_owner_created" ON "paldora"."account_exports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "account_exports_expiry" ON "paldora"."account_exports" USING btree ("expires_at") WHERE "paldora"."account_exports"."status" = 'ready';
