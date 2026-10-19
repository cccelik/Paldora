import { comments, notifications, users } from '@paldora/database';
import { UNREAD_COUNT_CAP, userChannel } from '@paldora/validation';
import { eq, inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openStream, type OpenStream } from '../testing/event-stream.js';
import { client, expectError, json, ok } from '../testing/http.js';
import { notificationTools } from '../testing/notifications.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

let app: TestApp;
let redis: Redis;
const open: OpenStream[] = [];
beforeAll(async () => {
  app = await createTestApp();
  redis = new Redis(process.env.REDIS_URL ?? '');
});
afterEach(() => {
  for (const stream of open.splice(0)) stream.close();
});
afterAll(async () => {
  redis.disconnect();
  await app.close();
});

const as = (user: TestUser) => client(app, user);
const tools = () => notificationTools(app);
const at = (offsetSeconds: number) =>
  new Date(Date.UTC(2026, 9, 19, 12, 0, offsetSeconds));

/**
 * A post by the Box owner with one notification of every kind addressed to
 * them, made through the real API and delivered as the projector would.
 */
async function inboxScene() {
  const scene = scenes(app);
  const { deliver } = tools();
  const room = await scene.room();
  const { owner, admin, member, box } = room;
  const post = await scene.say(owner, box.id, 'owner post');
  const second = await scene.say(owner, box.id, 'second post');
  const memberComment = await scene.comment(member, post.id, 'private words');
  const ownerComment = await scene.comment(owner, post.id, 'my comment');
  const reply = await scene.comment(
    admin,
    post.id,
    'reply words',
    ownerComment.id,
  );
  await scene.reactToPost(admin, post.id, '👍');
  await scene.reactToComment(member, ownerComment.id, '🔥');
  await scene.cameraReaction(member, box.id, second.id);
  const ids = {
    comment: await deliver({
      recipient: owner,
      actor: member,
      type: 'post.comment',
      postId: post.id,
      commentId: memberComment.id,
      createdAt: at(1),
    }),
    reaction: await deliver({
      recipient: owner,
      actor: admin,
      type: 'post.reaction',
      postId: post.id,
      createdAt: at(2),
    }),
    reply: await deliver({
      recipient: owner,
      actor: admin,
      type: 'comment.reply',
      postId: post.id,
      commentId: reply.id,
      createdAt: at(3),
    }),
    commentReaction: await deliver({
      recipient: owner,
      actor: member,
      type: 'comment.reaction',
      postId: post.id,
      commentId: ownerComment.id,
      createdAt: at(4),
    }),
    camera: await deliver({
      recipient: owner,
      actor: member,
      type: 'post.reaction',
      postId: second.id,
      createdAt: at(4),
    }),
  };
  return {
    ...room,
    scene,
    post,
    second,
    memberComment,
    ownerComment,
    reply,
    ids,
  };
}

describe('reading notifications', () => {
  it('pages newest first with live display data and the unread count', async () => {
    const s = await inboxScene();
    const { inbox, unread } = tools();
    const seen: string[] = [];
    let query = '?limit=2';
    for (let page = 0; page < 5; page += 1) {
      // Sequential by protocol: each page needs the previous cursor.

      const result = await inbox(s.owner, query);
      expect(result.items.length).toBeLessThanOrEqual(2);
      expect(result.unreadCount).toEqual({ count: 5, capped: false });
      seen.push(...result.items.map((item) => item.id));
      if (!result.nextCursor) break;
      query = `?limit=2&cursor=${result.nextCursor}`;
    }
    // Two rows share a timestamp: the ID breaks the tie without repeats.
    const tied = [s.ids.commentReaction, s.ids.camera].sort().reverse();
    expect(seen).toEqual([...tied, s.ids.reply, s.ids.reaction, s.ids.comment]);
    expect(await unread(s.owner)).toEqual({ count: 5, capped: false });

    const byId = new Map(
      (await inbox(s.owner)).items.map((item) => [item.id, item]),
    );
    expect(byId.get(s.ids.comment)).toMatchObject({
      type: 'post.comment',
      actor: { id: s.member.id, username: s.member.username },
      postId: s.post.id,
      commentId: s.memberComment.id,
      box: { id: s.box.id, name: 'Crew' },
      reaction: null,
      read: false,
    });
    expect(byId.get(s.ids.reaction)).toMatchObject({
      type: 'post.reaction',
      commentId: null,
      reaction: { kind: '👍' },
    });
    expect(byId.get(s.ids.reply)).toMatchObject({
      type: 'comment.reply',
      commentId: s.reply.id,
    });
    expect(byId.get(s.ids.commentReaction)).toMatchObject({
      type: 'comment.reaction',
      commentId: s.ownerComment.id,
      reaction: { kind: '🔥' },
    });
    const camera = byId.get(s.ids.camera);
    expect(camera?.reaction?.kind).toBe('real');
    expect(camera?.reaction?.thumbnailUrl).toEqual(expect.any(String));
    // Content is never part of a notification.
    const body = JSON.stringify([...byId.values()]);
    for (const leak of ['private words', 'reply words', 'owner post']) {
      expect(body).not.toContain(leak);
    }
  });

  it('shows each person only their own notifications', async () => {
    const s = await inboxScene();
    const { inbox, unread } = tools();
    expect((await inbox(s.member)).items).toEqual([]);
    expect(await unread(s.member)).toEqual({ count: 0, capped: false });
    expect((await inbox(s.stranger)).items).toEqual([]);
  });

  it('counts unread notifications up to the cap', async () => {
    const scene = scenes(app);
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const rows = await app.database
      .insert(comments)
      .values(
        Array.from({ length: UNREAD_COUNT_CAP + 1 }, () => ({
          postId: post.id,
          authorUserId: member.id,
          content: 'hi',
        })),
      )
      .returning({ id: comments.id });
    await app.database.insert(notifications).values(
      rows.map((row) => ({
        recipientUserId: owner.id,
        actorUserId: member.id,
        type: 'post.comment',
        postId: post.id,
        commentId: row.id,
        dedupeKey: `post.comment:${row.id}`,
      })),
    );
    const { unread } = tools();
    expect(await unread(owner)).toEqual({
      count: UNREAD_COUNT_CAP,
      capped: true,
    });
    await app.database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.commentId, rows[0]?.id ?? ''));
    expect(await unread(owner)).toEqual({
      count: UNREAD_COUNT_CAP,
      capped: false,
    });
  });

  it('rejects suspended recipients outright', async () => {
    const s = await inboxScene();
    await app.database
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, s.owner.id));
    await expectError(
      await as(s.owner).get('/me/notifications'),
      403,
      'ACCOUNT_BLOCKED',
    );
    await expectError(
      await as(s.owner).post(`/me/notifications/${s.ids.comment}/read`),
      403,
      'ACCOUNT_BLOCKED',
    );
  });
});

describe('marking notifications read', () => {
  it('marks one read, idempotently, then all', async () => {
    const s = await inboxScene();
    const { inbox, unread } = tools();
    await ok(await as(s.owner).post(`/me/notifications/${s.ids.reply}/read`));
    await ok(await as(s.owner).post(`/me/notifications/${s.ids.reply}/read`));
    expect(await unread(s.owner)).toEqual({ count: 4, capped: false });
    const page = await inbox(s.owner);
    expect(page.items.find((item) => item.id === s.ids.reply)?.read).toBe(true);
    await ok(await as(s.owner).post('/me/notifications/read-all'));
    expect(await unread(s.owner)).toEqual({ count: 0, capped: false });
    expect((await inbox(s.owner)).items.every((item) => item.read)).toBe(true);
    await ok(await as(s.owner).post('/me/notifications/read-all'));
  });

  it('answers NOTIFICATION_NOT_FOUND for other people’s and unknown IDs', async () => {
    const s = await inboxScene();
    for (const response of [
      await as(s.member).post(`/me/notifications/${s.ids.comment}/read`),
      await as(s.stranger).post(`/me/notifications/${s.ids.comment}/read`),
      await as(s.owner).post(`/me/notifications/${randomUUID()}/read`),
    ]) {
      await expectError(response, 404, 'NOTIFICATION_NOT_FOUND');
    }
    await expectError(
      await as(s.owner).post('/me/notifications/not-a-uuid/read'),
      400,
      'VALIDATION_FAILED',
    );
    // Someone else's attempt changed nothing.
    expect(await tools().unread(s.owner)).toEqual({ count: 5, capped: false });
    // Marking all of yours never touches anyone else's.
    await ok(await as(s.member).post('/me/notifications/read-all'));
    expect(await tools().unread(s.owner)).toEqual({ count: 5, capped: false });
  });

  it('settles a double mark-read race on one read time', async () => {
    const s = await inboxScene();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        as(s.owner).post(`/me/notifications/${s.ids.comment}/read`),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([
      204, 204, 204, 204,
    ]);
    const [row] = await app.database
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, s.ids.comment));
    expect(row?.readAt).toBeInstanceOf(Date);
  });
});

describe('notification visibility, rechecked at every read', () => {
  type Scene = Awaited<ReturnType<typeof inboxScene>>;
  const cases: [
    string,
    (s: Scene) => Promise<unknown>,
    (s: Scene) => string[],
  ][] = [
    [
      'the recipient left the Box (all of it)',
      async (s) => {
        // The owner must hand over the Box before leaving it.
        await json(
          await as(s.owner).put(`/boxes/${s.box.id}/owner`, {
            userId: s.admin.id,
          }),
        );
        await ok(await as(s.owner).delete(`/boxes/${s.box.id}/members/me`));
      },
      (s) => Object.values(s.ids),
    ],
    [
      'the comment was deleted',
      (s) => as(s.member).delete(`/comments/${s.memberComment.id}`),
      (s) => [s.ids.comment],
    ],
    [
      'the reply was deleted',
      (s) => as(s.admin).delete(`/comments/${s.reply.id}`),
      (s) => [s.ids.reply],
    ],
    [
      'the post reaction was removed',
      (s) => as(s.admin).put(`/posts/${s.post.id}/reaction`, { kind: null }),
      (s) => [s.ids.reaction],
    ],
    [
      'the reacted comment was deleted',
      (s) => as(s.owner).delete(`/comments/${s.ownerComment.id}`),
      (s) => [s.ids.commentReaction],
    ],
    [
      'the comment reaction was removed',
      (s) =>
        as(s.member).put(`/comments/${s.ownerComment.id}/reaction`, {
          kind: null,
        }),
      (s) => [s.ids.commentReaction],
    ],
    [
      'the post was deleted',
      (s) => as(s.owner).delete(`/posts/${s.post.id}`),
      (s) => [
        s.ids.comment,
        s.ids.reaction,
        s.ids.reply,
        s.ids.commentReaction,
      ],
    ],
    [
      'the actor was suspended',
      (s) =>
        app.database
          .update(users)
          .set({ status: 'suspended' })
          .where(eq(users.id, s.member.id)),
      (s) => [s.ids.comment, s.ids.commentReaction, s.ids.camera],
    ],
  ];

  it.each(cases)('hides them when %s', async (_name, change, hidden) => {
    const s = await inboxScene();
    const { unread, visibleIds } = tools();
    expect(await visibleIds(s.owner)).toHaveLength(5);
    await change(s);
    const gone = hidden(s);
    const remaining = await visibleIds(s.owner);
    expect(remaining.filter((id) => gone.includes(id))).toEqual([]);
    expect(remaining).toHaveLength(5 - gone.length);
    expect((await unread(s.owner)).count).toBe(5 - gone.length);
    for (const id of gone) {
      // Sequential for clarity: one 404 per hidden notification.

      await expectError(
        await as(s.owner).post(`/me/notifications/${id}/read`),
        404,
        'NOTIFICATION_NOT_FOUND',
      );
    }
    // Mark-all cannot reach them either, so nothing hidden is changed.
    await ok(await as(s.owner).post('/me/notifications/read-all'));
    const untouched = await app.database
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(inArray(notifications.id, gone));
    expect(untouched.every((row) => row.readAt === null)).toBe(true);
  });

  it('keeps them visible in an archived Box', async () => {
    const s = await inboxScene();
    await json(
      await as(s.owner).patch(`/boxes/${s.box.id}`, { status: 'archived' }),
    );
    expect(await tools().visibleIds(s.owner)).toHaveLength(5);
    await ok(await as(s.owner).post(`/me/notifications/${s.ids.comment}/read`));
  });
});

describe('notification realtime hints', () => {
  async function listen(user: TestUser) {
    const stream = await openStream(app.baseUrl, user.token);
    open.push(stream);
    expect(stream.response.status).toBe(200);
    await stream.waitFor((event) => event.type === 'resync');
    return stream;
  }

  it('delivers notification.created only to the recipient, IDs only', async () => {
    const s = await inboxScene();
    const [recipient, other] = await Promise.all([
      listen(s.owner),
      listen(s.member),
    ]);
    // Published exactly as the worker's projector does, after its commit.
    await redis.publish(
      userChannel(s.owner.id),
      JSON.stringify({
        type: 'notification.created',
        notificationId: s.ids.comment,
        postId: s.post.id,
        at: new Date().toISOString(),
      }),
    );
    const event = await recipient.waitFor(
      (candidate) => candidate.type === 'notification.created',
    );
    expect(Object.keys(event).sort()).toEqual([
      'at',
      'notificationId',
      'postId',
      'type',
    ]);
    expect(event).toMatchObject({
      notificationId: s.ids.comment,
      postId: s.post.id,
    });
    await other.expectNone(
      (candidate) => candidate.type === 'notification.created',
    );
  });

  it('tells the person’s other streams after marking read', async () => {
    const s = await inboxScene();
    const [first, second, other] = await Promise.all([
      listen(s.owner),
      listen(s.owner),
      listen(s.member),
    ]);
    await ok(await as(s.owner).post(`/me/notifications/${s.ids.reply}/read`));
    for (const stream of [first, second]) {
      // Sequential for clarity: each stream gets its own hint.

      const event = await stream.waitFor(
        (candidate) => candidate.type === 'notifications.changed',
      );
      expect(Object.keys(event).sort()).toEqual(['at', 'type']);
    }
    await ok(await as(s.owner).post('/me/notifications/read-all'));
    await second.waitFor(
      (candidate) =>
        candidate.type === 'notifications.changed' &&
        second.events.filter((e) => e.type === 'notifications.changed')
          .length >= 2,
    );
    await other.expectNone(
      (candidate) => candidate.type === 'notifications.changed',
    );
  });
});
