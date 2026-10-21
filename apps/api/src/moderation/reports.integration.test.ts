import {
  mediaAssets,
  moderationAudit,
  staffGrants,
  userReports,
} from '@paldora/database';
import { readyMediaAsset } from '@paldora/database/testing';
import {
  feedPageSchema,
  reportReceiptPageSchema,
  reportReceiptSchema,
} from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json } from '../test-support/http.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);
const report = (
  targetKind: 'user' | 'box' | 'post' | 'comment',
  targetId: string,
) => ({
  targetKind,
  targetId,
  category: 'harassment',
  detail: 'This content needs a private review.',
});

describe('private reports and case access', () => {
  it('hides and restores a reported post, retiring signed media bytes before success', async () => {
    const scene = scenes(app);
    const { owner, member, box } = await scene.room();
    const moderator = await app.person();
    await app.database
      .insert(staffGrants)
      .values({ userId: moderator.id, role: 'moderator' });
    const photo = await readyMediaAsset(app.database, {
      ownerId: owner.id,
      boxId: box.id,
      purpose: 'post_image',
    });
    for (const key of Object.values(photo.keys))
      app.storage.put(key, 'image/jpeg', new Uint8Array([1, 2, 3]));
    const post = await json<{ id: string }>(
      await as(owner).post(`/boxes/${box.id}/posts`, {
        content: 'Reported photo',
        mediaAssetIds: [photo.id],
      }),
      201,
    );
    const receipt = reportReceiptSchema.parse(
      await json(
        await as(member).post('/reports', report('post', post.id)),
        201,
      ),
    );
    const path = `/moderation/cases/${receipt.id}/actions`;
    await json(
      await as(moderator).post(path, {
        action: 'hide',
        reason: 'The reported image violates the published content policy.',
        idempotencyKey: randomUUID(),
      }),
      201,
    );
    await expectError(
      await as(member).get(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    const feed = feedPageSchema.parse(
      await json(await as(member).get(`/boxes/${box.id}/posts`)),
    );
    expect(
      feed.items.some(
        (item) => item.kind === 'post' && item.post.id === post.id,
      ),
    ).toBe(false);
    const [asset] = await app.database
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, photo.id));
    expect(asset?.status).toBe('deleted');
    for (const key of Object.values(photo.keys))
      expect(app.storage.objects.has(key)).toBe(false);
    await json(
      await as(moderator).post(path, {
        action: 'restore',
        reason: 'Review established that the text may remain available.',
        idempotencyKey: randomUUID(),
      }),
      201,
    );
    expect((await as(member).get(`/posts/${post.id}`)).status).toBe(200);
  });

  it('hides a reported comment and its replies without exposing the author', async () => {
    const scene = scenes(app);
    const { owner, member, box } = await scene.room();
    const moderator = await app.person();
    await app.database
      .insert(staffGrants)
      .values({ userId: moderator.id, role: 'moderator' });
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(member, post.id, 'Reported comment');
    const reply = await scene.comment(owner, post.id, 'A reply', root.id);
    const receipt = reportReceiptSchema.parse(
      await json(
        await as(owner).post('/reports', report('comment', root.id)),
        201,
      ),
    );
    await json(
      await as(moderator).post(`/moderation/cases/${receipt.id}/actions`, {
        action: 'hide',
        reason: 'The comment includes a prohibited personal disclosure.',
        idempotencyKey: randomUUID(),
      }),
      201,
    );
    await expectError(
      await as(owner).get(`/comments/${root.id}`),
      404,
      'COMMENT_NOT_FOUND',
    );
    await expectError(
      await as(owner).get(`/comments/${reply.id}`),
      404,
      'COMMENT_NOT_FOUND',
    );
    await expectError(
      await as(owner).get(`/comments/${root.id}/replies`),
      404,
      'COMMENT_NOT_FOUND',
    );
    const threads = await scene.threads(owner, post.id);
    expect(
      threads.items.some(
        (item) =>
          item.root.kind === 'comment' && item.root.comment.id === root.id,
      ),
    ).toBe(false);
  });

  it('does not commit a photo takedown when storage retirement fails', async () => {
    const scene = scenes(app);
    const { owner, member, box } = await scene.room();
    const moderator = await app.person();
    await app.database
      .insert(staffGrants)
      .values({ userId: moderator.id, role: 'moderator' });
    const photo = await readyMediaAsset(app.database, {
      ownerId: owner.id,
      boxId: box.id,
      purpose: 'post_image',
    });
    const post = await json<{ id: string }>(
      await as(owner).post(`/boxes/${box.id}/posts`, {
        content: 'Photo awaiting review',
        mediaAssetIds: [photo.id],
      }),
      201,
    );
    const receipt = reportReceiptSchema.parse(
      await json(
        await as(member).post('/reports', report('post', post.id)),
        201,
      ),
    );
    app.storage.failNext();
    expect(
      (
        await as(moderator).post(`/moderation/cases/${receipt.id}/actions`, {
          action: 'hide',
          reason: 'The reported image requires immediate retirement.',
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(500);
    expect((await as(member).get(`/posts/${post.id}`)).status).toBe(200);
    const [asset] = await app.database
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, photo.id));
    expect(asset?.status).toBe('ready');
  });

  it('limits exact account lookup to administrators and audits hits and misses', async () => {
    const administrator = await app.person();
    const moderator = await app.person();
    const subject = await app.person();
    await app.database.insert(staffGrants).values([
      { userId: administrator.id, role: 'administrator' },
      { userId: moderator.id, role: 'moderator' },
    ]);
    const path = `/moderation/accounts/${subject.id}`;
    await expectError(
      await as(moderator).get(path),
      403,
      'MODERATION_FORBIDDEN',
    );
    expect(await json(await as(administrator).get(path))).toEqual({
      id: subject.id,
      username: subject.username,
      status: 'active',
    });
    const absent = randomUUID();
    await expectError(
      await as(administrator).get(`/moderation/accounts/${absent}`),
      404,
      'USER_NOT_FOUND',
    );
    const lookups = await app.database
      .select()
      .from(moderationAudit)
      .where(eq(moderationAudit.actorUserId, administrator.id));
    expect(
      lookups.filter((event) => event.event === 'account.lookup'),
    ).toHaveLength(2);
    expect(lookups.map((event) => event.subjectId)).toContain(absent);
  });

  it('audits idempotent suspension and restoration, blocking new account requests', async () => {
    const moderator = await app.person();
    const reporter = await app.person();
    const subject = await app.person();
    await app.database
      .insert(staffGrants)
      .values({ userId: moderator.id, role: 'moderator' });
    const receipt = reportReceiptSchema.parse(
      await json(
        await as(reporter).post('/reports', report('user', subject.id)),
        201,
      ),
    );
    const suspend = {
      action: 'suspend',
      reason: 'The case evidence meets the suspension policy.',
      idempotencyKey: randomUUID(),
    };
    const path = `/moderation/cases/${receipt.id}/actions`;
    const first = await json<{ status: string }>(
      await as(moderator).post(path, suspend),
      201,
    );
    expect(first.status).toBe('closed');
    expect(
      (
        await json<{ status: string }>(
          await as(moderator).post(path, suspend),
          201,
        )
      ).status,
    ).toBe('closed');
    await expectError(
      await app.request(subject, '/me'),
      403,
      'ACCOUNT_BLOCKED',
    );
    await expectError(
      await as(reporter).post(path, {
        ...suspend,
        idempotencyKey: randomUUID(),
      }),
      403,
      'MODERATION_FORBIDDEN',
    );
    const restore = {
      action: 'unsuspend',
      reason: 'An appeal established the suspension was mistaken.',
      idempotencyKey: randomUUID(),
    };
    expect((await as(moderator).post(path, restore)).status).toBe(201);
    expect((await app.request(subject, '/me')).status).toBe(200);
    const audits = await app.database
      .select()
      .from(moderationAudit)
      .where(eq(moderationAudit.subjectId, receipt.id));
    expect(audits.map((item) => item.event).sort()).toEqual([
      'account.suspended',
      'account.unsuspended',
    ]);
  });

  it('returns one private receipt for a visible user, and only staff can open it', async () => {
    const reporter = await app.person();
    const subject = await app.person();
    const stranger = await app.person();
    const first = await as(reporter).post(
      '/reports',
      report('user', subject.id),
    );
    expect(first.status).toBe(201);
    expect(first.headers.get('cache-control')).toContain('no-store');
    const receipt = reportReceiptSchema.parse(await json(first, 201));
    const second = reportReceiptSchema.parse(
      await json(
        await as(reporter).post('/reports', report('user', subject.id)),
        201,
      ),
    );
    expect(second.id).toBe(receipt.id);
    expect(
      reportReceiptPageSchema.parse(
        await json(await as(stranger).get('/me/reports')),
      ).items,
    ).toEqual([]);
    const mine = reportReceiptPageSchema.parse(
      await json(await as(reporter).get('/me/reports')),
    );
    expect(mine.items.map((item) => item.id)).toContain(receipt.id);
    await expectError(
      await as(stranger).get('/moderation/cases'),
      403,
      'MODERATION_FORBIDDEN',
    );
    await expectError(
      await as(stranger).get(`/moderation/cases/${receipt.id}`),
      403,
      'MODERATION_FORBIDDEN',
    );

    await app.database
      .insert(staffGrants)
      .values({ userId: stranger.id, role: 'moderator' });
    const queue = await json<{ items: { id: string }[] }>(
      await as(stranger).get('/moderation/cases'),
    );
    expect(queue.items.some((item) => item.id === receipt.id)).toBe(true);
    const opened = await json<{
      id: string;
      reporterUserId: string;
      detail: string;
    }>(await as(stranger).get(`/moderation/cases/${receipt.id}`));
    expect(opened).toMatchObject({
      id: receipt.id,
      reporterUserId: reporter.id,
    });
    expect(opened.detail).toBe('This content needs a private review.');
    const [audit] = await app.database
      .select()
      .from(moderationAudit)
      .where(eq(moderationAudit.subjectId, receipt.id));
    expect(audit).toMatchObject({
      event: 'case.viewed',
      actorUserId: stranger.id,
    });
  });

  it('uses the ordinary absence response for guessed and blocked people', async () => {
    const reporter = await app.person();
    const target = await app.person();
    await expectError(
      await as(reporter).post('/reports', report('user', randomUUID())),
      404,
      'USER_NOT_FOUND',
    );
    await as(target).post('/blocks', { username: reporter.username });
    await expectError(
      await as(reporter).post('/reports', report('user', target.id)),
      404,
      'USER_NOT_FOUND',
    );
    const [row] = await app.database
      .select()
      .from(userReports)
      .where(eq(userReports.reporterUserId, reporter.id));
    expect(row).toBeUndefined();
  });

  it('requires current Box and post access before storing allegations', async () => {
    const owner = await app.person();
    const viewer = await app.person();
    const box = await scenes(app).newBox(owner);
    await expectError(
      await as(viewer).post('/reports', report('box', box.id)),
      404,
      'BOX_NOT_FOUND',
    );
    await scenes(app).join(owner, box.id, viewer);
    const boxReceipt = await as(viewer).post('/reports', report('box', box.id));
    expect(boxReceipt.status).toBe(201);
    const post = await json<{ id: string }>(
      await as(owner).post(`/boxes/${box.id}/posts`, {
        content: 'A post to review',
      }),
      201,
    );
    expect(
      (await as(viewer).post('/reports', report('post', post.id))).status,
    ).toBe(201);
    await expectError(
      await as(viewer).post('/reports', report('post', randomUUID())),
      404,
      'POST_NOT_FOUND',
    );
  });
});
