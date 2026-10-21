import {
  comments,
  moderationAudit,
  posts,
  userReports,
  users,
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

export interface ModerationRetentionResult {
  readonly purged: number;
  readonly redacted: number;
}

/** Purge evidence after 90 days, retaining a minimal pointer for active enforcement. */
export async function retainClosedModerationCases(
  database: PaldoraDatabase,
  limit = 100,
): Promise<ModerationRetentionResult> {
  return database.transaction(async (tx) => {
    const cases = await tx
      .select()
      .from(userReports)
      .where(
        and(
          eq(userReports.status, 'closed'),
          lte(userReports.retentionNextAt, sql`now()`),
        ),
      )
      .orderBy(userReports.retentionNextAt, userReports.id)
      .for('update', { skipLocked: true })
      .limit(limit);
    if (cases.length === 0) return { purged: 0, redacted: 0 };
    const ids = cases.map((row) => row.id);
    await tx
      .delete(moderationAudit)
      .where(
        and(
          inArray(moderationAudit.subjectId, ids),
          inArray(moderationAudit.event, [...caseEvents]),
        ),
      );
    const activeIds: string[] = [];
    const inactiveIds: string[] = [];
    for (const report of cases) {
      let active = false;
      if (report.targetKind === 'user') {
        // eslint-disable-next-line no-await-in-loop
        const [target] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.id, report.targetId), eq(users.status, 'suspended')),
          )
          .limit(1);
        active = Boolean(target);
      } else if (report.targetKind === 'post') {
        // eslint-disable-next-line no-await-in-loop
        const [target] = await tx
          .select({ id: posts.id })
          .from(posts)
          .where(
            and(
              eq(posts.id, report.targetId),
              eq(posts.moderationHidden, true),
            ),
          )
          .limit(1);
        active = Boolean(target);
      } else if (report.targetKind === 'comment') {
        // eslint-disable-next-line no-await-in-loop
        const [target] = await tx
          .select({ id: comments.id })
          .from(comments)
          .where(
            and(
              eq(comments.id, report.targetId),
              eq(comments.moderationHidden, true),
            ),
          )
          .limit(1);
        active = Boolean(target);
      }
      (active ? activeIds : inactiveIds).push(report.id);
    }
    if (activeIds.length > 0)
      await tx
        .update(userReports)
        .set({
          reporterUserId: null,
          detail: null,
          evidencePurgedAt: sql`coalesce(${userReports.evidencePurgedAt}, now())`,
          retentionNextAt: sql`now() + interval '1 day'`,
        })
        .where(inArray(userReports.id, activeIds));
    if (inactiveIds.length > 0)
      await tx.delete(userReports).where(inArray(userReports.id, inactiveIds));
    return { purged: inactiveIds.length, redacted: activeIds.length };
  });
}
