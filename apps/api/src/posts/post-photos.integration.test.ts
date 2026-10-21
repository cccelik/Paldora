import {
  boxes,
  mediaAssets,
  mediaJobOutbox,
  postMedia,
} from '@paldora/database';
import { readyMediaAsset } from '@paldora/database/testing';
import {
  feedPageSchema,
  mediaUploadSchema,
  postSchema,
} from '@paldora/validation';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../test-support/http.js';
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

const newBox: ReturnType<typeof scenes>['newBox'] = (...args) =>
  scenes(app).newBox(...args);

const join: ReturnType<typeof scenes>['join'] = (...args) =>
  scenes(app).join(...args);

/** A photo as the worker leaves it when processing has finished. */
async function photo(
  owner: TestUser,
  boxId: string,
  status: 'ready' | 'processing' = 'ready',
) {
  return readyMediaAsset(app.database, {
    ownerId: owner.id,
    boxId,
    purpose: 'post_image',
    status,
  });
}

const post = (user: TestUser, boxId: string, body: unknown) =>
  as(user).post(`/boxes/${boxId}/posts`, body);

async function room() {
  const [owner, member, stranger] = (await Promise.all(
    ['owner', 'member', 'stranger'].map((name) => app.person(name)),
  )) as [TestUser, TestUser, TestUser];
  const box = await newBox(owner);
  await join(owner, box.id, member);
  return { owner, member, stranger, box };
}

describe('reserving a post photo', () => {
  const reserve = (user: TestUser, body: Record<string, unknown>) =>
    as(user).post('/media/uploads', {
      purpose: 'post_image',
      contentType: 'image/jpeg',
      contentLength: 2_048,
      ...body,
    });

  it('needs membership in an open Box and names that Box', async () => {
    const { owner, member, stranger, box } = await room();
    for (const user of [owner, member]) {
      const upload = mediaUploadSchema.parse(
        await json(await reserve(user, { boxId: box.id }), 201),
      );
      expect(upload.mediaAsset.purpose).toBe('post_image');
    }
    await expectError(
      await reserve(stranger, { boxId: box.id }),
      404,
      'BOX_NOT_FOUND',
    );
    await expectError(
      await reserve(owner, { boxId: randomUUID() }),
      404,
      'BOX_NOT_FOUND',
    );
    await expectError(await reserve(owner, {}), 400, 'VALIDATION_FAILED');
    await expectError(
      await as(owner).post('/media/uploads', {
        purpose: 'avatar',
        contentType: 'image/png',
        contentLength: 10,
        boxId: box.id,
      }),
      400,
      'VALIDATION_FAILED',
    );
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    await expectError(
      await reserve(owner, { boxId: box.id }),
      409,
      'BOX_ARCHIVED',
    );
  });
});

describe('posting with photos', () => {
  it('returns photos in order with signed display and thumbnail URLs only', async () => {
    const { owner, member, box } = await room();
    const [first, second] = [
      await photo(owner, box.id),
      await photo(owner, box.id),
    ];
    const created = postSchema.parse(
      await json(
        await post(owner, box.id, {
          content: ' look ',
          mediaAssetIds: [second.id, first.id],
        }),
        201,
      ),
    );
    expect(created.media.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(created.media[0]).toMatchObject({ width: 1600, height: 1200 });
    const seen = postSchema.parse(
      await json(await as(member).get(`/posts/${created.id}`)),
    );
    const text = JSON.stringify(seen);
    expect(text).toContain(encodeURIComponent(first.keys.displayObjectKey));
    expect(text).toContain(encodeURIComponent(first.keys.thumbnailObjectKey));
    for (const secret of [
      first.keys.masterObjectKey,
      first.keys.uploadObjectKey,
    ]) {
      expect(text).not.toContain(encodeURIComponent(secret));
    }
  });

  it('allows a post that is only photos, but not an empty one', async () => {
    const { owner, box } = await room();
    const only = await photo(owner, box.id);
    const created = postSchema.parse(
      await json(await post(owner, box.id, { mediaAssetIds: [only.id] }), 201),
    );
    expect(created).toMatchObject({ content: '', media: [{ id: only.id }] });
    await expectError(
      await post(owner, box.id, { content: '  ' }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(await post(owner, box.id, {}), 400, 'VALIDATION_FAILED');
  });

  it('allows at most four, each once', async () => {
    const { owner, box } = await room();
    const five = await Promise.all(
      Array.from({ length: 5 }, () => photo(owner, box.id)),
    );
    await expectError(
      await post(owner, box.id, { mediaAssetIds: five.map((item) => item.id) }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await post(owner, box.id, { mediaAssetIds: [five[0]!.id, five[0]!.id] }),
      400,
      'VALIDATION_FAILED',
    );
    const four = postSchema.parse(
      await json(
        await post(owner, box.id, {
          mediaAssetIds: five.slice(0, 4).map((item) => item.id),
        }),
        201,
      ),
    );
    expect(four.media).toHaveLength(4);
  });

  it('treats every unusable photo as missing, and unfinished ones as not ready', async () => {
    const { owner, member, box } = await room();
    const otherBox = await newBox(owner, 'Elsewhere');
    const mine = await photo(owner, box.id);
    const theirs = await photo(member, box.id);
    const wrongBox = await photo(owner, otherBox.id);
    const pending = await photo(owner, box.id, 'processing');
    const attempt = (ids: string[]) =>
      post(owner, box.id, { content: 'x', mediaAssetIds: ids });

    await expectError(await attempt([theirs.id]), 404, 'MEDIA_NOT_FOUND');
    await expectError(await attempt([wrongBox.id]), 404, 'MEDIA_NOT_FOUND');
    await expectError(await attempt([randomUUID()]), 404, 'MEDIA_NOT_FOUND');
    await expectError(await attempt([pending.id]), 409, 'MEDIA_NOT_READY');
    await expectError(
      await attempt([mine.id, theirs.id]),
      404,
      'MEDIA_NOT_FOUND',
    );
    // Nothing above consumed my photo.
    await json(await attempt([mine.id]), 201);
    // A used photo cannot be used again.
    await expectError(await attempt([mine.id]), 404, 'MEDIA_NOT_FOUND');
  });

  it('lets only one of two simultaneous posts claim a photo', async () => {
    const { owner, box } = await room();
    const only = await photo(owner, box.id);
    const results = await Promise.all([
      post(owner, box.id, { content: 'a', mediaAssetIds: [only.id] }),
      post(owner, box.id, { content: 'b', mediaAssetIds: [only.id] }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 404]);
    const attached = await app.database
      .select()
      .from(postMedia)
      .where(eq(postMedia.mediaAssetId, only.id));
    expect(attached).toHaveLength(1);
  });

  it('shows photos in feeds to members only, never in hidden placeholders', async () => {
    const { owner, member, stranger, box } = await room();
    const shot = await photo(member, box.id);
    const created = postSchema.parse(
      await json(
        await post(member, box.id, {
          content: 'with photo',
          mediaAssetIds: [shot.id],
        }),
        201,
      ),
    );
    const feed = async (user: TestUser) =>
      feedPageSchema.parse(
        await json(await as(user).get(`/boxes/${box.id}/posts`)),
      );
    const open = await feed(owner);
    expect(open.items[0]).toMatchObject({
      kind: 'post',
      post: { id: created.id, media: [{ id: shot.id }] },
    });
    expect(
      feedPageSchema.parse(await json(await as(stranger).get('/me/feed')))
        .items,
    ).toEqual([]);

    await json(
      await as(owner).post('/blocks', { username: member.username }),
      201,
    );
    const hidden = await feed(owner);
    expect(hidden.items[0]?.kind).toBe('hidden');
    expect(JSON.stringify(hidden)).not.toMatch(/media|url|webp|with photo/);
    // The author still sees their own photo.
    expect(
      postSchema.parse(await json(await as(member).get(`/posts/${created.id}`)))
        .media,
    ).toHaveLength(1);
  });
});

describe('editing and deleting posts with photos', () => {
  it('lets the text go empty only while photos remain, and never changes the photos', async () => {
    const { owner, box } = await room();
    const shot = await photo(owner, box.id);
    const withPhoto = postSchema.parse(
      await json(
        await post(owner, box.id, {
          content: 'caption',
          mediaAssetIds: [shot.id],
        }),
        201,
      ),
    );
    const edited = postSchema.parse(
      await json(
        await as(owner).patch(`/posts/${withPhoto.id}`, { content: '' }),
      ),
    );
    expect(edited).toMatchObject({ content: '', media: [{ id: shot.id }] });
    await expectError(
      await as(owner).patch(`/posts/${withPhoto.id}`, {
        content: '',
        mediaAssetIds: [],
      }),
      400,
      'VALIDATION_FAILED',
    );
    const textOnly = postSchema.parse(
      await json(await post(owner, box.id, { content: 'plain' }), 201),
    );
    await expectError(
      await as(owner).patch(`/posts/${textOnly.id}`, { content: ' ' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('retires every object of a deleted post in the same transaction', async () => {
    const { owner, box } = await room();
    const shot = await photo(owner, box.id);
    const created = postSchema.parse(
      await json(
        await post(owner, box.id, { content: 'bye', mediaAssetIds: [shot.id] }),
        201,
      ),
    );
    await ok(await as(owner).delete(`/posts/${created.id}`));
    const [asset] = await app.database
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, shot.id));
    expect(asset?.status).toBe('deleted');
    expect(
      await app.database
        .select()
        .from(postMedia)
        .where(eq(postMedia.postId, created.id)),
    ).toEqual([]);
    const jobs = await app.database
      .select()
      .from(mediaJobOutbox)
      .where(
        sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${shot.keys.masterObjectKey}`,
      );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload.objectKeys).toEqual(
      expect.arrayContaining(Object.values(shot.keys)),
    );
  });

  it('retires every photo in a Box that is deleted, and releases the Box row', async () => {
    const { owner, member, box } = await room();
    const ids = [await photo(owner, box.id), await photo(member, box.id)];
    await json(
      await post(owner, box.id, { content: 'a', mediaAssetIds: [ids[0]!.id] }),
      201,
    );
    // The second photo was never attached: it is still the Box's to clean up.
    await ok(await as(owner).delete(`/boxes/${box.id}?confirmName=Crew`));
    const assets = await app.database
      .select()
      .from(mediaAssets)
      .where(
        inArray(
          mediaAssets.id,
          ids.map((item) => item.id),
        ),
      );
    expect(assets.map((asset) => asset.status)).toEqual(['deleted', 'deleted']);
    expect(assets.every((asset) => asset.boxId === null)).toBe(true);
    for (const item of ids) {
      const jobs = await app.database
        .select()
        .from(mediaJobOutbox)
        .where(
          sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${item.keys.displayObjectKey}`,
        );
      expect(jobs).toHaveLength(1);
    }
    expect(
      await app.database.select().from(boxes).where(eq(boxes.id, box.id)),
    ).toEqual([]);
  });
});
