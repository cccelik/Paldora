import { accountDeletionRequests, boxMemberships } from '@paldora/database';
import { accountDeletionSchema } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json } from '../test-support/http.js';
import { scenes } from '../test-support/scenes.js';
import { createTestApp, type TestApp } from '../test-support/test-app.js';

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('seven-day account deletion request', () => {
  it('requires reauthentication and Box transfer, then allows cancellation', async () => {
    const scene = scenes(app);
    const { owner, member, box } = await scene.room();
    await expectError(
      await scene.as(owner).post('/me/deletion', { password: 'wrong' }),
      403,
      'ACCOUNT_REAUTH_FAILED',
    );
    await expectError(
      await scene
        .as(owner)
        .post('/me/deletion', { password: 'correct-password' }),
      409,
      'BOX_OWNERSHIP_TRANSFER_REQUIRED',
    );
    await json(
      await scene
        .as(owner)
        .put(`/boxes/${box.id}/owner`, { userId: member.id }),
    );
    const requested = accountDeletionSchema.parse(
      await json(
        await scene
          .as(owner)
          .post('/me/deletion', { password: 'correct-password' }),
        201,
      ),
    );
    expect(requested.status).toBe('pending');
    expect(
      new Date(requested.dueAt).getTime() -
        new Date(requested.requestedAt).getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(await json(await scene.as(owner).get('/me/deletion'))).toMatchObject(
      { deletion: { id: requested.id } },
    );
    const [live] = await app.database
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, requested.id));
    expect(live?.nextAttemptAt).toEqual(live?.dueAt);
    await expectError(
      await app.request(owner, '/me/deletion', {
        method: 'DELETE',
        body: { password: 'wrong' },
      }),
      403,
      'ACCOUNT_REAUTH_FAILED',
    );
    const cancelled = accountDeletionSchema.parse(
      await json(
        await app.request(owner, '/me/deletion', {
          method: 'DELETE',
          body: { password: 'correct-password' },
        }),
      ),
    );
    expect(cancelled.status).toBe('cancelled');
    expect(await json(await scene.as(owner).get('/me/deletion'))).toEqual({
      deletion: null,
    });
    const owners = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(eq(boxMemberships.boxId, box.id), eq(boxMemberships.role, 'owner')),
      );
    expect(owners.map((row) => row.userId)).toEqual([member.id]);
  });

  it('closes cancellation at the seven-day deadline even if the worker is late', async () => {
    const person = await app.person('late-cancellation');
    const requested = accountDeletionSchema.parse(
      await json(
        await scenes(app)
          .as(person)
          .post('/me/deletion', { password: 'correct-password' }),
        201,
      ),
    );
    const requestedAt = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    await app.database
      .update(accountDeletionRequests)
      .set({
        requestedAt,
        dueAt: new Date(requestedAt.getTime() + 7 * 24 * 60 * 60_000),
      })
      .where(eq(accountDeletionRequests.id, requested.id));
    await expectError(
      await app.request(person, '/me/deletion', {
        method: 'DELETE',
        body: { password: 'correct-password' },
      }),
      409,
      'ACCOUNT_DELETION_WINDOW_CLOSED',
    );
  });
});
