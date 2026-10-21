CREATE TYPE "paldora"."report_category" AS ENUM('harassment', 'spam', 'privacy', 'other');--> statement-breakpoint
CREATE TYPE "paldora"."report_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "paldora"."report_target_kind" AS ENUM('user', 'box', 'post', 'comment');--> statement-breakpoint
CREATE TABLE "paldora"."user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"target_kind" "paldora"."report_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"category" "paldora"."report_category" NOT NULL,
	"detail" text,
	"status" "paldora"."report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "user_reports_detail_check" CHECK ("paldora"."user_reports"."detail" is null or char_length("paldora"."user_reports"."detail") between 1 and 2000),
	CONSTRAINT "user_reports_closed_check" CHECK (("paldora"."user_reports"."status" = 'closed') = ("paldora"."user_reports"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "paldora"."user_reports" ADD CONSTRAINT "user_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "paldora"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_reports_reporter_target_unique" ON "paldora"."user_reports" USING btree ("reporter_user_id","target_kind","target_id") WHERE "paldora"."user_reports"."reporter_user_id" is not null;--> statement-breakpoint
CREATE INDEX "user_reports_queue_index" ON "paldora"."user_reports" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_reports_reporter_index" ON "paldora"."user_reports" USING btree ("reporter_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);