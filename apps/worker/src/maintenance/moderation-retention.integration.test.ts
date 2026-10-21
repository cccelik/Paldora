import { moderationAudit, userReports } from '@paldora/database';
import { createPerson } from '@paldora/database/testing';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectTestDatabase } from '../test-support/database.js';
import {
  MODERATION_CASE_RETENTION_MS,
  retainClosedModerationCases,
} from './moderation-retention.js';

const { database } = connectTestDatabase('paldora-moderation-retention-test');

describe('closed moderation case retention', () => {
  it('purges case evidence after 90 days while preserving newer and operator audits', async () => {
    const reporter = await createPerson(database, {
      label: 'retention-reporter',
    });
    const now = new Date();
    const oldClosedAt = new Date(
      now.getTime() - MODERATION_CASE_RETENTION_MS - 24 * 60 * 60_000,
    );
    const freshClosedAt = new Date(
      now.getTime() - MODERATION_CASE_RETENTION_MS + 24 * 60 * 60_000,
    );
    const [oldCase, freshCase] = await database
      .insert(userReports)
      .values([
        {
          reporterUserId: reporter,
          targetKind: 'post',
          targetId: randomUUID(),
          category: 'privacy',
          detail: 'Old private allegation',
          status: 'closed',
          closedAt: oldClosedAt,
        },
        {
          reporterUserId: reporter,
          targetKind: 'post',
          targetId: randomUUID(),
          category: 'privacy',
          detail: 'Fresh private allegation',
          status: 'closed',
          closedAt: freshClosedAt,
        },
      ])
      .returning({ id: userReports.id });
    const [oldAudit, freshAudit, operatorAudit] = await database
      .insert(moderationAudit)
      .values([
        {
          actorUserId: reporter,
          subjectId: oldCase!.id,
          event: 'case.viewed',
          reason: 'Moderator reviewed this old case.',
          idempotencyKey: randomUUID(),
        },
        {
          actorUserId: reporter,
          subjectId: freshCase!.id,
          event: 'case.closed',
          reason: 'Moderator closed this recent case.',
          idempotencyKey: randomUUID(),
        },
        {
          actorUserId: reporter,
          subjectId: reporter,
          event: 'staff.granted',
          reason: 'Operator granted this staff role.',
          idempotencyKey: randomUUID(),
        },
      ])
      .returning({ id: moderationAudit.id });
    await expect(
      database
        .delete(moderationAudit)
        .where(eq(moderationAudit.id, freshAudit!.id)),
    ).rejects.toThrow();
    expect(await retainClosedModerationCases(database)).toBe(1);
    expect(await retainClosedModerationCases(database)).toBe(0);
    expect(
      await database
        .select()
        .from(userReports)
        .where(eq(userReports.id, oldCase!.id)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(moderationAudit)
        .where(eq(moderationAudit.id, oldAudit!.id)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(userReports)
        .where(eq(userReports.id, freshCase!.id)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(moderationAudit)
        .where(eq(moderationAudit.id, freshAudit!.id)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(moderationAudit)
        .where(eq(moderationAudit.id, operatorAudit!.id)),
    ).toHaveLength(1);
  });
});
