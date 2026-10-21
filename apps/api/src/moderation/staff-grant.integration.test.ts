import { moderationAudit, staffGrants } from '@paldora/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../test-support/test-app.js';
import { changeStaffGrant } from './staff-grant.js';

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('operator staff grants', () => {
  it('rejects unaudited promotion and writes grant/revoke history', async () => {
    const actor = await app.person();
    const target = await app.person();
    const request = {
      actorUserId: actor.id,
      targetUserId: target.id,
      action: 'grant' as const,
      role: 'moderator' as const,
      reason: 'Operator approved this moderator after review.',
    };
    await expect(changeStaffGrant(app.database, request)).rejects.toThrow(
      'administrator',
    );
    await app.database
      .insert(staffGrants)
      .values({ userId: actor.id, role: 'administrator' });
    await changeStaffGrant(app.database, request);
    const [grant] = await app.database
      .select()
      .from(staffGrants)
      .where(eq(staffGrants.userId, target.id));
    expect(grant?.role).toBe('moderator');
    await changeStaffGrant(app.database, {
      ...request,
      action: 'revoke',
    });
    const [removed] = await app.database
      .select()
      .from(staffGrants)
      .where(eq(staffGrants.userId, target.id));
    expect(removed).toBeUndefined();
    const audit = await app.database
      .select()
      .from(moderationAudit)
      .where(eq(moderationAudit.subjectId, target.id));
    expect(audit.map((row) => row.event).sort()).toEqual([
      'staff.granted',
      'staff.revoked',
    ]);
  });
});
