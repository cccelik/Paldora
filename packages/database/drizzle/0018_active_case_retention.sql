ALTER TABLE "paldora"."user_reports" ADD COLUMN "evidence_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paldora"."user_reports" ADD COLUMN "retention_next_at" timestamp with time zone;--> statement-breakpoint
UPDATE "paldora"."user_reports" SET "retention_next_at" = "closed_at" + interval '90 days' WHERE "status" = 'closed';--> statement-breakpoint
DROP INDEX "paldora"."user_reports_retention_index";--> statement-breakpoint
CREATE INDEX "user_reports_retention_index" ON "paldora"."user_reports" USING btree ("retention_next_at") WHERE "paldora"."user_reports"."status" = 'closed';--> statement-breakpoint
ALTER TABLE "paldora"."user_reports" ADD CONSTRAINT "user_reports_retention_check" CHECK (("status" = 'closed') = ("retention_next_at" is not null));
