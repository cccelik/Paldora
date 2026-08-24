ALTER TYPE "paldora"."activity_event_type" ADD VALUE 'life_update.published';--> statement-breakpoint
ALTER TYPE "paldora"."notification_type" ADD VALUE 'life_update.published';--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD COLUMN "life_update_id" uuid;--> statement-breakpoint
ALTER TABLE "paldora"."notifications" ADD CONSTRAINT "notifications_life_update_id_life_updates_id_fk" FOREIGN KEY ("life_update_id") REFERENCES "paldora"."life_updates"("id") ON DELETE cascade ON UPDATE no action;
