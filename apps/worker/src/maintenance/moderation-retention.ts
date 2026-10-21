import {
  moderationAudit,
  userReports,
  type PaldoraDatabase,
} from '@paldora/database';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';

export const MODERATION_CASE_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const caseEvents = [
  'case.viewed',
  'case.closed',
  'content.hidden',
  'content.restored',
  'account.suspended',
  'account.unsuspended',
] as const;

/** Purge closed-case allegations and their audit after 90 days, in bounded batches. */
export async function retainClosedModerationCases(
  database: PaldoraDatabase,
  limit = 100,
): Promise<number> {
  return database.transaction(async (tx) => {
    const cases = await tx
      .select({ id: userReports.id })
      .from(userReports)
      .where(
        and(
          eq(userReports.status, 'closed'),
          lte(userReports.closedAt, sql`now() - interval '90 days'`),
        ),
      )
      .orderBy(userReports.closedAt, userReports.id)
      .for('update', { skipLocked: true })
      .limit(limit);
    if (cases.length === 0) return 0;
    const ids = cases.map((row) => row.id);
    await tx
      .delete(moderationAudit)
      .where(
        and(
          inArray(moderationAudit.subjectId, ids),
          inArray(moderationAudit.event, [...caseEvents]),
        ),
      );
    await tx.delete(userReports).where(inArray(userReports.id, ids));
    return ids.length;
  });
}
