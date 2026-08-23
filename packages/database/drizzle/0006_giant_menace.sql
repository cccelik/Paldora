CREATE TABLE "paldora"."media_job_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_job_outbox_job_type_check" CHECK ("paldora"."media_job_outbox"."job_type" in ('delete-media-object', 'process-post-image')),
	CONSTRAINT "media_job_outbox_attempts_check" CHECK ("paldora"."media_job_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "media_job_outbox_pending_index" ON "paldora"."media_job_outbox" USING btree ("available_at","created_at") WHERE "paldora"."media_job_outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "media_job_outbox_media_asset_index" ON "paldora"."media_job_outbox" USING btree ("media_asset_id");--> statement-breakpoint
ALTER TABLE "paldora"."media_assets" ADD CONSTRAINT "media_assets_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "paldora"."boxes"("id") ON DELETE cascade ON UPDATE no action;