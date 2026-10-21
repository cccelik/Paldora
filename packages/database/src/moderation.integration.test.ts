import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { moderationAudit, staffGrants } from './index.js';
import {
  connectTestDatabase,
  failureOf,
  PG_ERROR,
} from './test-support/connection.js';
import { contentFixtures } from './test-support/content.js';

const { database } = connectTestDatabase('paldora-moderation-schema-test');
const { newUser } = contentFixtures(database);

describe('moderation foundation', () => {
  it('limits staff grants to existing users and known roles', async () => {
    const userId = await newUser();
    await database.insert(staffGrants).values({ userId, role: 'moderator' });
    const [grant] = await database
      .select()
      .from(staffGrants)
      .where(eq(staffGrants.userId, userId));
    expect(grant?.role).toBe('moderator');
    expect(
      (
        await failureOf(
          database.insert(staffGrants).values({
            userId: randomUUID(),
            role: 'moderator',
          }),
        )
      ).code,
    ).toBe(PG_ERROR.FOREIGN_KEY);
  });

  it('makes audit events append-only and idempotent', async () => {
    const actorUserId = await newUser();
    const subjectId = randomUUID();
    const idempotencyKey = randomUUID();
    const [event] = await database
      .insert(moderationAudit)
      .values({
        actorUserId,
        subjectId,
        idempotencyKey,
        event: 'case.viewed',
        reason: 'Reviewed a reported item in the case queue.',
      })
      .returning({ id: moderationAudit.id });
    expect(event?.id).toBeDefined();
    const duplicate = await failureOf(
      database.insert(moderationAudit).values({
        actorUserId,
        subjectId,
        idempotencyKey,
        event: 'case.viewed',
        reason: 'Reviewed a reported item in the case queue.',
      }),
    );
    expect(duplicate.code).toBe(PG_ERROR.UNIQUE);
    const mutation = await failureOf(
      database
        .update(moderationAudit)
        .set({ reason: 'Trying to rewrite the audit event.' })
        .where(eq(moderationAudit.id, event!.id)),
    );
    expect(mutation.code).toBe(PG_ERROR.INTEGRITY);
    const deletion = await failureOf(
      database.delete(moderationAudit).where(eq(moderationAudit.id, event!.id)),
    );
    expect(deletion.code).toBe(PG_ERROR.INTEGRITY);
  });
});
