import {
  activityEvents,
  commentReactions,
  mediaAssets,
  mediaJobOutbox,
  postReactions,
} from '@paldora/database';
import {
  mediaUploadSchema,
  postReactionPageSchema,
  type PostReactionEntry,
} from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  openStream,
  type OpenStream,
} from '../../test-support/event-stream.js';
import { expectError, json, ok } from '../../test-support/http.js';
import { scenes } from '../../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../../test-support/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
const streams: OpenStream[] = [];
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
});
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
});
afterAll(() => app.close());

const as = (user: TestUser) => scene.as(user);
const putPost = (user: TestUser, postId: string, body: unknown) =>
  as(user).put(`/posts/${postId}/reaction`, body);
const putComment = (user: TestUser, commentId: string, body: unknown) =>
  as(user).put(`/comments/${commentId}/reaction`, body);

async function block(blocker: TestUser, target: TestUser) {
  await json(
    await as(blocker).post('/blocks', { username: target.username }),
    201,
  );
}

const eventsFor = (postId: string) =>
  app.database
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.postId, postId))
    .orderBy(activityEvents.createdAt);

const postReactionRows = (postId: string) =>
  app.database
    .select()
    .from(postReactions)
    .where(eq(postReactions.postId, postId));

const assetStatus = async (id: string) =>
  (
    await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
  )[0]?.status;

const deletionQueuedFor = async (id: string) =>
  (
    await app.database
      .select({ id: mediaJobOutbox.id })
      .from(mediaJobOutbox)
      .where(
        and(
          eq(mediaJobOutbox.jobType, 'media.delete'),
          sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${`media/${id}/thumbnail.webp`}`,
        ),
      )
  ).length;

describe('post reactions', () => {
  it('sets, changes, repeats, and removes one reaction per person', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const first = await scene.reactToPost(member, post.id, '👍');
    expect(first).toMatchObject({
      reactionCount: 1,
      reactions: [{ kind: '👍', count: 1 }],
      viewerReaction: { kind: '👍' },
      canInteract: true,
    });
    await scene.reactToPost(member, post.id, '👍');
    const changed = await scene.reactToPost(member, post.id, '🏳️‍🌈');
    expect(changed).toMatchObject({
      reactionCount: 1,
      reactions: [{ kind: '🏳️‍🌈', count: 1 }],
      viewerReaction: { kind: '🏳️‍🌈' },
    });
    expect(await postReactionRows(post.id)).toHaveLength(1);
    for (const attempt of [1, 2]) {
      const removed = await json(
        await putPost(member, post.id, { kind: null }),
      );
      expect(removed, `attempt ${attempt}`).toMatchObject({
        reactionCount: 0,
        viewerReaction: null,
      });
    }
    expect(await postReactionRows(post.id)).toEqual([]);
  });

  it('records one activity event for a new reaction, never for a change or a re-react', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await scene.reactToPost(member, post.id, '👍');
    await scene.reactToPost(member, post.id, '😂');
    await ok(await putPost(member, post.id, { kind: null }), 200);
    await scene.reactToPost(member, post.id, '❤️');
    const events = await eventsFor(post.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'post.reaction.set',
      actorUserId: member.id,
      commentId: null,
      dedupeKey: `post.reaction:${post.id}:${member.id}`,
      status: 'pending',
    });
  });

  it('lets two simultaneous reactions by one person end as one row and one event', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const kinds = ['👍', '😂', '❤️', '😮', '🎉'];
    const responses = await Promise.all(
      kinds.map((kind) => putPost(member, post.id, { kind })),
    );
    expect(responses.map((response) => response.status)).toEqual(
      kinds.map(() => 200),
    );
    expect(await postReactionRows(post.id)).toHaveLength(1);
    expect(await eventsFor(post.id)).toHaveLength(1);
  });

  it('rejects anything but one emoji, a camera image, or null', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    for (const body of [
      {},
      { kind: 'ok' },
      { kind: '👍👍' },
      { kind: ' 👍' },
      { kind: 'real' },
      { kind: '👍', mediaAssetId: randomUUID() },
      { kind: '👍', extra: 1 },
    ]) {
      await expectError(
        await putPost(owner, post.id, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    await expectError(
      await putPost(owner, 'not-a-uuid', { kind: '👍' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('answers POST_NOT_FOUND to strangers, former members, guessed IDs, and deleted posts', async () => {
    const { owner, member, stranger, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const gone = await scene.say(owner, box.id);
    await ok(await as(owner).delete(`/posts/${gone.id}`));
    await expectError(
      await putPost(stranger, post.id, { kind: '👍' }),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await putPost(owner, randomUUID(), { kind: '👍' }),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await putPost(owner, gone.id, { kind: '👍' }),
      404,
      'POST_NOT_FOUND',
    );
    await ok(await as(member).delete(`/boxes/${box.id}/members/me`));
    await expectError(
      await putPost(member, post.id, { kind: '👍' }),
      404,
      'POST_NOT_FOUND',
    );
  });

  it('answers POST_NOT_FOUND across a block in either direction', async () => {
    for (const direction of ['viewer', 'author'] as const) {
      // Sequential: each direction needs its own fresh scene.
      const { owner, member, box } = await scene.room();
      const post = await scene.say(owner, box.id);
      if (direction === 'viewer') await block(member, owner);
      else await block(owner, member);
      await expectError(
        await putPost(member, post.id, { kind: '👍' }),
        404,
        'POST_NOT_FOUND',
      );
    }
  });

  it('is read-only in an archived Box', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await scene.reactToPost(member, post.id, '👍');
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    for (const body of [{ kind: '😂' }, { kind: null }]) {
      await expectError(
        await putPost(member, post.id, body),
        409,
        'BOX_ARCHIVED',
      );
    }
    expect((await scene.postView(member, post.id)).interactions).toMatchObject({
      reactionCount: 1,
      canInteract: false,
    });
  });

  it('sends an ID-only reaction.changed hint to the Box, only when something changed', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const stream = await openStream(app.baseUrl, owner.token);
    streams.push(stream);
    await stream.waitFor((event) => event.type === 'resync');
    await scene.reactToPost(member, post.id, '👍');
    const hint = await stream.waitFor(
      (event) => event.type === 'reaction.changed',
    );
    expect(Object.keys(hint).sort()).toEqual(['at', 'boxId', 'postId', 'type']);
    expect(hint).toMatchObject({ boxId: box.id, postId: post.id });
    await scene.reactToPost(member, post.id, '👍');
    await stream.expectNone(
      (event) => event.type === 'reaction.changed' && event.at > hint.at,
      300,
    );
  });
});

describe('comment reactions', () => {
  it('sets, changes, and removes an emoji, recording one event', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    expect(await scene.reactToComment(member, said.id, '🔥')).toEqual({
      reactions: [{ kind: '🔥', count: 1 }],
      reactionCount: 1,
      viewerReaction: { kind: '🔥' },
    });
    await scene.reactToComment(member, said.id, '😂');
    expect(
      await json(await putComment(member, said.id, { kind: null })),
    ).toEqual({ reactions: [], reactionCount: 0, viewerReaction: null });
    await scene.reactToComment(member, said.id, '❤️');
    const events = (await eventsFor(post.id)).filter(
      (event) => event.type === 'comment.reaction.set',
    );
    expect(events).toEqual([
      expect.objectContaining({
        actorUserId: member.id,
        commentId: said.id,
        dedupeKey: `comment.reaction:${said.id}:${member.id}`,
      }),
    ]);
  });

  it('takes no camera reactions', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    for (const body of [
      { kind: 'real' },
      { kind: 'real', mediaAssetId: randomUUID() },
    ]) {
      await expectError(
        await putComment(owner, said.id, body),
        400,
        'VALIDATION_FAILED',
      );
    }
  });

  it('answers COMMENT_NOT_FOUND to strangers, guessed IDs, and deleted comments', async () => {
    const { owner, member, stranger, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    const gone = await scene.comment(owner, post.id);
    await ok(await as(owner).delete(`/comments/${gone.id}`));
    for (const [user, id] of [
      [stranger, said.id],
      [member, randomUUID()],
      [member, gone.id],
    ] as const) {
      await expectError(
        await putComment(user, id, { kind: '👍' }),
        404,
        'COMMENT_NOT_FOUND',
      );
    }
  });

  it('maps a block with the post author to POST_NOT_FOUND and with the comment or root author to COMMENT_NOT_FOUND', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const byAdmin = await scene.comment(admin, post.id);
    const replyByOwner = await scene.comment(owner, post.id, 'r', byAdmin.id);
    const byOwner = await scene.comment(owner, post.id);
    await block(member, admin);
    await expectError(
      await putComment(member, byAdmin.id, { kind: '👍' }),
      404,
      'COMMENT_NOT_FOUND',
    );
    // A reply inside a thread whose root is hidden is hidden too.
    await expectError(
      await putComment(member, replyByOwner.id, { kind: '👍' }),
      404,
      'COMMENT_NOT_FOUND',
    );
    await scene.reactToComment(member, byOwner.id, '👍');
    await block(owner, member);
    await expectError(
      await putComment(member, byOwner.id, { kind: '😂' }),
      404,
      'POST_NOT_FOUND',
    );
  });

  it('is read-only in an archived Box', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    await expectError(
      await putComment(member, said.id, { kind: '👍' }),
      409,
      'BOX_ARCHIVED',
    );
    expect(
      await app.database
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, said.id)),
    ).toEqual([]);
  });

  it('sends a reaction.changed hint naming the comment', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    const stream = await openStream(app.baseUrl, owner.token);
    streams.push(stream);
    await stream.waitFor((event) => event.type === 'resync');
    await scene.reactToComment(member, said.id);
    const hint = await stream.waitFor(
      (event) => event.type === 'reaction.changed',
    );
    expect(hint).toMatchObject({
      boxId: box.id,
      postId: post.id,
      commentId: said.id,
    });
  });
});

describe('comment activity events', () => {
  it('records post.comment for a root and comment.reply for a reply, with the comment', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(member, post.id);
    const reply = await scene.comment(owner, post.id, 'r', root.id);
    const events = await eventsFor(post.id);
    expect(
      events.map(({ type, actorUserId, commentId, dedupeKey }) => ({
        type,
        actorUserId,
        commentId,
        dedupeKey,
      })),
    ).toEqual([
      {
        type: 'comment.created',
        actorUserId: member.id,
        commentId: root.id,
        dedupeKey: `post.comment:${root.id}`,
      },
      {
        type: 'comment.created',
        actorUserId: owner.id,
        commentId: reply.id,
        dedupeKey: `comment.reply:${reply.id}`,
      },
    ]);
  });

  it('records nothing when the comment is refused', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    await expectError(
      await as(member).post(`/posts/${post.id}/comments`, { content: 'x' }),
      409,
      'BOX_ARCHIVED',
    );
    expect(await eventsFor(post.id)).toEqual([]);
  });
});

describe('camera reactions', () => {
  const real = (mediaAssetId: string) => ({ kind: 'real', mediaAssetId });

  it('claims a ready capture and shows it in the summary', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const image = await scene.cameraImage(member, box.id);
    const summary = await json(await putPost(member, post.id, real(image)));
    expect(summary).toMatchObject({
      realCount: 1,
      reactionCount: 1,
      viewerReaction: { kind: 'real', mediaAssetId: image },
      realPreview: [{ user: { id: member.id } }],
    });
    // Repeating the same camera reaction changes nothing.
    await json(await putPost(member, post.id, real(image)));
    expect(await assetStatus(image)).toBe('ready');
    expect(await eventsFor(post.id)).toHaveLength(1);
  });

  it('refuses captures that are not yours, from another Box, another purpose, used, or retired', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const otherBox = await scene.newBox(member, 'Elsewhere');
    const elsewhere = await scene.say(member, otherBox.id);
    const cases = [
      await scene.cameraImage(owner, box.id),
      await scene.cameraImage(member, otherBox.id),
      await scene.cameraImage(member, box.id, { purpose: 'post_image' }),
      await scene.cameraImage(member, box.id, { status: 'failed' }),
      await scene.cameraImage(member, box.id, { status: 'deleted' }),
      randomUUID(),
    ];
    const used = await scene.cameraReaction(member, otherBox.id, elsewhere.id);
    for (const id of [...cases, used]) {
      await expectError(
        await putPost(member, post.id, real(id)),
        404,
        'MEDIA_NOT_FOUND',
      );
    }
    expect(await postReactionRows(post.id)).toEqual([]);
  });

  it('answers MEDIA_NOT_READY while the capture is still processing', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const image = await scene.cameraImage(member, box.id, {
      status: 'processing',
      masterObjectKey: null,
      displayObjectKey: null,
      thumbnailObjectKey: null,
      width: null,
      height: null,
    });
    await expectError(
      await putPost(member, post.id, real(image)),
      409,
      'MEDIA_NOT_READY',
    );
  });

  it('lets only one of two reactions racing for one capture have it', async () => {
    const { owner, member, box } = await scene.room();
    const first = await scene.say(owner, box.id);
    const second = await scene.say(owner, box.id);
    const image = await scene.cameraImage(member, box.id);
    const responses = await Promise.all([
      putPost(member, first.id, real(image)),
      putPost(member, second.id, real(image)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);
    const loser = responses.find((response) => response.status === 404);
    await expectError(loser!, 404, 'MEDIA_NOT_FOUND');
  });

  it('retires the capture it replaces or removes, in the same transaction', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const first = await scene.cameraReaction(member, box.id, post.id);
    const second = await scene.cameraImage(member, box.id);
    await json(await putPost(member, post.id, real(second)));
    expect(await assetStatus(first)).toBe('deleted');
    expect(await deletionQueuedFor(first)).toBe(1);
    expect(await scene.reactToPost(member, post.id, '😂')).toMatchObject({
      realCount: 0,
      viewerReaction: { kind: '😂' },
    });
    expect(await assetStatus(second)).toBe('deleted');
    expect(await deletionQueuedFor(second)).toBe(1);
    const third = await scene.cameraReaction(member, box.id, post.id);
    await json(await putPost(member, post.id, { kind: null }));
    expect(await assetStatus(third)).toBe('deleted');
    expect(await deletionQueuedFor(third)).toBe(1);
    // Switching between emoji and camera is a change, never a new event.
    expect(await eventsFor(post.id)).toHaveLength(1);
  });
});

describe('listing a post’s reactions', () => {
  const list = async (user: TestUser, postId: string, query = '') =>
    postReactionPageSchema.parse(
      await json(await as(user).get(`/posts/${postId}/reactions${query}`)),
    );
  const people = (items: readonly PostReactionEntry[]) =>
    items.map((item) => item.user.id);

  it('pages newest first, filters by kind, and signs camera images', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await scene.reactToPost(owner, post.id, '😂');
    await scene.reactToPost(admin, post.id, '❤️');
    const image = await scene.cameraReaction(member, box.id, post.id);
    const first = await list(owner, post.id, '?limit=2');
    expect(people(first.items)).toEqual([member.id, admin.id]);
    expect(first.items[0]).toMatchObject({ kind: 'real' });
    expect(first.items[0]?.image?.url).toContain(
      encodeURIComponent(`media/${image}/display.webp`),
    );
    expect(first.items[1]?.image).toBeUndefined();
    const rest = await list(
      owner,
      post.id,
      `?limit=2&cursor=${first.nextCursor ?? ''}`,
    );
    expect(people(rest.items)).toEqual([owner.id]);
    expect(rest.nextCursor).toBeNull();
    const camera = await list(owner, post.id, '?kind=real');
    expect(people(camera.items)).toEqual([member.id]);
    const laughs = await list(
      owner,
      post.id,
      `?kind=${encodeURIComponent('😂')}`,
    );
    expect(people(laughs.items)).toEqual([owner.id]);
  });

  it('omits reactors in a block relationship with the viewer, in both directions', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await scene.reactToPost(admin, post.id, '😂');
    await scene.cameraReaction(member, box.id, post.id);
    await block(owner, admin);
    await block(member, owner);
    expect((await list(owner, post.id)).items).toEqual([]);
    expect((await scene.postView(owner, post.id)).interactions).toMatchObject({
      reactionCount: 0,
      realCount: 0,
      realPreview: [],
    });
  });

  it('answers POST_NOT_FOUND to strangers and rejects bad queries', async () => {
    const { owner, stranger, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await expectError(
      await as(stranger).get(`/posts/${post.id}/reactions`),
      404,
      'POST_NOT_FOUND',
    );
    for (const query of ['?kind=ok', '?limit=51', '?cursor=nope']) {
      await expectError(
        await as(owner).get(`/posts/${post.id}/reactions${query}`),
        400,
        'VALIDATION_FAILED',
      );
    }
  });
});

describe('camera upload reservations', () => {
  const reserve = (user: TestUser, boxId: string) =>
    as(user).post('/media/uploads', {
      purpose: 'reaction_image',
      boxId,
      contentType: 'image/jpeg',
      contentLength: 200_000,
    });

  it('are Box-scoped and at most 5 MB', async () => {
    const { owner, member, stranger, box } = await scene.room();
    const upload = mediaUploadSchema.parse(
      await json(await reserve(member, box.id), 201),
    );
    expect(upload.mediaAsset).toMatchObject({
      purpose: 'reaction_image',
      status: 'pending',
    });
    await expectError(await reserve(stranger, box.id), 404, 'BOX_NOT_FOUND');
    await expectError(
      await as(member).post('/media/uploads', {
        purpose: 'reaction_image',
        boxId: box.id,
        contentType: 'image/jpeg',
        contentLength: 5 * 1024 * 1024 + 1,
      }),
      400,
      'VALIDATION_FAILED',
    );
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    await expectError(await reserve(member, box.id), 409, 'BOX_ARCHIVED');
  });

  it('are limited to 120 per person per hour, separately from post photos', async () => {
    const { member, box } = await scene.room();
    const statuses: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      // Sequential, so the 121st attempt is unambiguous.
      statuses.push((await reserve(member, box.id)).status);
    }
    expect(new Set(statuses)).toEqual(new Set([201]));
    const over = await reserve(member, box.id);
    await expectError(over, 429, 'RATE_LIMITED');
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    const photo = await as(member).post('/media/uploads', {
      purpose: 'post_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: 1_000,
    });
    expect(photo.status).toBe(201);
  });
});
