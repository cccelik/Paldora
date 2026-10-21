CREATE INDEX "user_reports_retention_index" ON "paldora"."user_reports" USING btree ("closed_at") WHERE "paldora"."user_reports"."status" = 'closed';--> statement-breakpoint
CREATE OR REPLACE FUNCTION "paldora"."reject_moderation_audit_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.event IN (
      'case.viewed', 'case.closed', 'content.hidden', 'content.restored',
      'account.suspended', 'account.unsuspended'
    ) AND EXISTS (
      SELECT 1 FROM "paldora"."user_reports" r
      WHERE r.id = OLD.subject_id
        AND r.status = 'closed'
        AND r.closed_at <= now() - interval '90 days'
    ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'moderation audit is append-only until case retention expires' USING ERRCODE = '23000';
END;
$$;
