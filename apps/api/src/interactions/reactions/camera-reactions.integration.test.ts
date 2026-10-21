import {
  activityEvents,
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
import { type OpenStream } from '../../test-support/event-stream.js';
import { expectError, json } from '../../test-support/http.js';
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

const block: ReturnType<typeof scenes>['block'] = (...args) =>
  scenes(app).block(...args);

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
