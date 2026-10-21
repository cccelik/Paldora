import { mediaAssets, users } from '@paldora/database';
import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import {
  memoryPageSchema,
  memorySummarySchema,
  postSchema,
  roomPhotoPageSchema,
  type MemoryItemView,
} from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../../test-support/http.js';
import { lifeUpdateTools } from '../../test-support/life-updates.js';
import { countQueries } from '../../test-support/query-count.js';
import { roomTools } from '../../test-support/rooms.js';
import { scenes } from '../../test-support/scenes.js';
import {
  createTestApp,
  uniqueUsername,
  type TestApp,
  type TestUser,
} from '../../test-support/test-app.js';

/**
 * Room previews (plan B1, §D, §I "Preview re-filtering"): the owner's
 * content that the viewer can reach today, never more. Each test builds its
 * own people and Boxes, so the file is hermetic against leftover rows.
 */
let app: TestApp;
let rooms: ReturnType<typeof roomTools>;
let scene: ReturnType<typeof scenes>;
let updates: ReturnType<typeof lifeUpdateTools>;
beforeAll(async () => {
  app = await createTestApp();
  rooms = roomTools(app);
  scene = scenes(app);
  updates = lifeUpdateTools(app);
});
afterAll(() => app.close());

const contentOf = async (viewer: TestUser, owner: TestUser, query = '') =>
  memoryPageSchema.parse(
    await json(
      await rooms.as(viewer).get(`/rooms/${owner.username}/content${query}`),
    ),
  );
const summaryOf = async (viewer: TestUser, owner: TestUser, query = '') =>
  memorySummarySchema.parse(
    await json(
      await rooms
        .as(viewer)
        .get(`/rooms/${owner.username}/content/summary${query}`),
    ),
  );
const photosOf = async (viewer: TestUser, owner: TestUser, query = '') =>
  roomPhotoPageSchema.parse(
    await json(
      await rooms.as(viewer).get(`/rooms/${owner.username}/photos${query}`),
    ),
  );

const keyOf = (item: MemoryItemView) =>
  item.kind === 'post'
    ? `post:${item.post.id}`
    : `life_update:${item.lifeUpdate.id}`;
const keys = async (viewer: TestUser, owner: TestUser, query = '') =>
  (await contentOf(viewer, owner, query)).items.map(keyOf);
const total = (summary: { years: readonly { count: number }[] }) =>
  summary.years.reduce((sum, { count }) => sum + count, 0);

/** A processed `post_image` in `boxId`, as the worker leaves it. */
async function postPhoto(owner: TestUser, boxId: string) {
  const id = randomUUID();
  await app.database.insert(mediaAssets).values({
    id,
    ownerUserId: owner.id,
    boxId,
    purpose: 'post_image',
    status: 'ready',
    contentType: 'image/jpeg',
    contentLength: 1_000,
    uploadExpiresAt: new Date(),
    uploadObjectKey: `uploads/${id}`,
    masterObjectKey: `media/${id}/master.webp`,
    displayObjectKey: `media/${id}/display.webp`,
    thumbnailObjectKey: `media/${id}/thumbnail.webp`,
    width: 1600,
    height: 1200,
  });
  return id;
}

async function photoPost(owner: TestUser, boxId: string, photoIds: string[]) {
  return postSchema.parse(
    await json(
      await rooms.as(owner).post(`/boxes/${boxId}/posts`, {
        content: 'with photos',
        mediaAssetIds: photoIds,
      }),
      201,
    ),
  );
}

/**
 * An owner in Boxes Alpha and Bravo (distinctly named), a friend who is
 * only in Alpha, and a friend in both. Content: a post in each Box, a Life
 * Update to both, an Only Me one, and a post by the Alpha friend.
 */
async function world() {
  const [owner, alphaFriend, bothFriend] = [
    await app.person('owner'),
    await app.person('alpha'),
    await app.person('both'),
  ];
  await rooms.befriend(owner, alphaFriend);
  await rooms.befriend(owner, bothFriend);
  const alpha = await scene.newBox(owner, `Alpha ${randomUUID().slice(0, 6)}`);
  const bravo = await scene.newBox(owner, `Bravo ${randomUUID().slice(0, 6)}`);
  await scene.join(owner, alpha.id, alphaFriend);
  await scene.join(owner, alpha.id, bothFriend);
  await scene.join(owner, bravo.id, bothFriend);
  const inAlpha = await scene.say(owner, alpha.id, 'alpha post');
  const inBravo = await scene.say(owner, bravo.id, 'bravo post');
  const shared = await updates.shareTo(owner, [alpha.id, bravo.id]);
  const onlyMe = await updates.keepPrivate(owner);
  const byFriend = await scene.say(alphaFriend, alpha.id, 'not the owner');
  return {
    owner,
    alphaFriend,
    bothFriend,
    alpha,
    bravo,
    inAlpha,
    inBravo,
    shared,
    onlyMe,
    byFriend,
  };
}

describe('re-filtering by the viewer (a visible Room never widens access)', () => {
  it('shows a friend only the owner’s content in Boxes they share, with only their contexts', async () => {
    const w = await world();
    const page = await contentOf(w.alphaFriend, w.owner);
    expect(page.items.map(keyOf)).toEqual([
      `life_update:${w.shared.id}`,
      `post:${w.inAlpha.id}`,
    ]);
    const [lifeUpdate] = page.items;
    expect(
      lifeUpdate?.kind === 'life_update' &&
        lifeUpdate.lifeUpdate.contexts.map((context) => context.box.id),
    ).toEqual([w.alpha.id]);
    // Nothing about Bravo, Only Me, or other authors leaks, not even a count.
    const text = JSON.stringify([
      page,
      await summaryOf(w.alphaFriend, w.owner),
      await photosOf(w.alphaFriend, w.owner),
    ]);
    for (const secret of [
      w.bravo.id,
      w.bravo.name,
      w.inBravo.id,
      w.onlyMe.id,
      w.byFriend.id,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(total(await summaryOf(w.alphaFriend, w.owner))).toBe(2);
  });

  it('never shows Only Me, even to the owner, and the owner sees what a friend in every Box sees', async () => {
    const w = await world();
    const mine = await keys(w.owner, w.owner);
    expect(mine).toEqual([
      `life_update:${w.shared.id}`,
      `post:${w.inBravo.id}`,
      `post:${w.inAlpha.id}`,
    ]);
    expect(mine).not.toContain(`life_update:${w.onlyMe.id}`);
    expect(await keys(w.bothFriend, w.owner)).toEqual(mine);
    expect(await summaryOf(w.owner, w.owner)).toEqual(
      await summaryOf(w.bothFriend, w.owner),
    );
    expect(total(await summaryOf(w.owner, w.owner))).toBe(3);
    expect(await keys(w.owner, w.owner, '?type=life_updates')).toEqual([
      `life_update:${w.shared.id}`,
    ]);
    expect(await keys(w.owner, w.owner, '?type=posts')).toEqual([
      `post:${w.inBravo.id}`,
      `post:${w.inAlpha.id}`,
    ]);
  });

  it('shows a friend who shares no Box nothing, with no hint', async () => {
    const w = await world();
    const loner = await app.person('loner');
    await rooms.befriend(w.owner, loner);
    expect(await contentOf(loner, w.owner)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await summaryOf(loner, w.owner)).toEqual({
      years: [],
      year: null,
      months: [],
    });
    expect(await photosOf(loner, w.owner)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('a `members` visitor sees only the shared Box’s content', async () => {
    const w = await world();
    await rooms.patchRoom(w.owner, { visibility: 'members' });
    const member = await app.person('member');
    await scene.join(w.owner, w.bravo.id, member);
    expect(await keys(member, w.owner)).toEqual([
      `life_update:${w.shared.id}`,
      `post:${w.inBravo.id}`,
    ]);
  });

  it.each(['leaves', 'is removed'] as const)(
    'a friend who %s a Box loses its content at once',
    async (how) => {
      const w = await world();
      expect(await keys(w.alphaFriend, w.owner)).toHaveLength(2);
      await ok(
        how === 'leaves'
          ? await rooms
              .as(w.alphaFriend)
              .delete(`/boxes/${w.alpha.id}/members/me`)
          : await rooms
              .as(w.owner)
              .delete(`/boxes/${w.alpha.id}/members/${w.alphaFriend.id}`),
      );
      expect(await keys(w.alphaFriend, w.owner)).toEqual([]);
      expect((await summaryOf(w.alphaFriend, w.owner)).years).toEqual([]);
    },
  );

  it('keeps an archived Box’s content readable', async () => {
    const w = await world();
    await json(
      await rooms.as(w.owner).patch(`/boxes/${w.alpha.id}`, {
        status: 'archived',
      }),
    );
    expect(await keys(w.alphaFriend, w.owner)).toEqual([
      `life_update:${w.shared.id}`,
      `post:${w.inAlpha.id}`,
    ]);
  });

  it('drops deleted posts and Life Updates at once', async () => {
    const w = await world();
    await ok(await rooms.as(w.owner).delete(`/posts/${w.inAlpha.id}`));
    await ok(await rooms.as(w.owner).delete(`/life-updates/${w.shared.id}`));
    expect(await keys(w.alphaFriend, w.owner)).toEqual([]);
    expect(await keys(w.owner, w.owner)).toEqual([`post:${w.inBravo.id}`]);
    expect(total(await summaryOf(w.owner, w.owner))).toBe(1);
  });

  it('answers the same whether the content widgets are on or off', async () => {
    const w = await world();
    const before = await keys(w.alphaFriend, w.owner);
    const { updatedAt } = await rooms.myRoom(w.owner);
    await json(
      await rooms.as(w.owner).put('/me/room/widgets', {
        widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({
          ...widget,
          enabled: false,
        })),
        expectedUpdatedAt: updatedAt,
      }),
    );
    expect(await keys(w.alphaFriend, w.owner)).toEqual(before);
  });
});

describe('blocks (ADR 013 rows for Room content)', () => {
  it.each(['owner blocks', 'viewer blocks'] as const)(
    'a block (%s) hides content, counts, and photos from both, until unblocked',
    async (direction) => {
      const w = await world();
      const [blocker, blocked] =
        direction === 'owner blocks'
          ? [w.owner, w.alphaFriend]
          : [w.alphaFriend, w.owner];
      await rooms.block(blocker, blocked);
      for (const [viewer, owner] of [
        [w.alphaFriend, w.owner],
        [w.owner, w.alphaFriend],
      ] as const) {
        for (const path of ['content', 'content/summary', 'photos']) {
          await expectError(
            await rooms.as(viewer).get(`/rooms/${owner.username}/${path}`),
            404,
            'ROOM_NOT_FOUND',
          );
        }
      }
      // The owner's own Room is unaffected.
      expect(await keys(w.owner, w.owner)).toHaveLength(3);
      await ok(await rooms.as(blocker).delete(`/blocks/${blocked.id}`));
      // Unblocking does not restore the friendship the block removed.
      await rooms.patchRoom(w.owner, { visibility: 'members' });
      expect(await keys(w.alphaFriend, w.owner)).toEqual([
        `life_update:${w.shared.id}`,
        `post:${w.inAlpha.id}`,
      ]);
    },
  );
});

describe('photos', () => {
  async function gallery() {
    const w = await world();
    const [a1, a2, bravoPhoto, processing] = [
      await postPhoto(w.owner, w.alpha.id),
      await postPhoto(w.owner, w.alpha.id),
      await postPhoto(w.owner, w.bravo.id),
      await postPhoto(w.owner, w.alpha.id),
    ];
    const alphaPost = await photoPost(w.owner, w.alpha.id, [a2, a1]);
    const bravoPost = await photoPost(w.owner, w.bravo.id, [bravoPhoto]);
    // A post whose only photo is no longer ready carries no photo.
    const pending = await photoPost(w.owner, w.alpha.id, [processing]);
    await app.database
      .update(mediaAssets)
      .set({ status: 'deleted' })
      .where(eq(mediaAssets.id, processing));
    const luPhoto = await updates.photo(w.owner);
    const lifeUpdate = await updates.shareTo(
      w.owner,
      [w.alpha.id, w.bravo.id],
      {
        mediaAssetIds: [luPhoto.id],
      },
    );
    const privatePhoto = await updates.photo(w.owner);
    const privateUpdate = await updates.keepPrivate(w.owner, {
      mediaAssetIds: [privatePhoto.id],
    });
    const friendPhoto = await postPhoto(w.alphaFriend, w.alpha.id);
    await photoPost(w.alphaFriend, w.alpha.id, [friendPhoto]);
    return {
      ...w,
      a1,
      a2,
      bravoPhoto,
      processing,
      alphaPost,
      bravoPost,
      pending,
      luPhoto,
      lifeUpdate,
      privatePhoto,
      privateUpdate,
      friendPhoto,
    };
  }

  it('lists only reachable, ready photos, signed, newest item first', async () => {
    const g = await gallery();
    const page = await photosOf(g.alphaFriend, g.owner);
    expect(
      page.items.map(({ photo, source }) => ({ id: photo.id, source })),
    ).toEqual([
      {
        id: g.luPhoto.id,
        source: {
          kind: 'life_update',
          lifeUpdateId: g.lifeUpdate.id,
          boxId: g.alpha.id,
        },
      },
      { id: g.a2, source: { kind: 'post', postId: g.alphaPost.id } },
      { id: g.a1, source: { kind: 'post', postId: g.alphaPost.id } },
    ]);
    for (const { photo } of page.items) {
      expect(photo.thumbnailUrl).toContain(
        encodeURIComponent(`media/${photo.id}/thumbnail.webp`),
      );
      expect(photo.url).toContain(
        encodeURIComponent(`media/${photo.id}/display.webp`),
      );
    }
    const text = JSON.stringify(page);
    for (const secret of [
      g.bravoPhoto,
      g.bravoPost.id,
      g.bravo.id,
      g.processing,
      g.pending.id,
      g.privatePhoto.id,
      g.privateUpdate.id,
      g.friendPhoto,
      'master.webp',
      'uploads/',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('never shows Only Me photos to the owner either, and pages by item', async () => {
    const g = await gallery();
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      // Sequential by nature: each page needs the previous cursor.
      const page: Awaited<ReturnType<typeof photosOf>> = await photosOf(
        g.owner,
        g.owner,
        `?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      );
      ids.push(...page.items.map((item) => item.photo.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(ids).toEqual([g.luPhoto.id, g.bravoPhoto, g.a2, g.a1]);
    expect(pages).toBe(3);
  });

  it('rejects a limit beyond 12 items whatever the Room', async () => {
    const owner = await app.person('owner');
    for (const name of [owner.username, uniqueUsername('nobody')]) {
      await expectError(
        await rooms.as(owner).get(`/rooms/${name}/photos?limit=13`),
        400,
        'VALIDATION_FAILED',
      );
    }
  });
});

describe('paging and cost', () => {
  it('pages every year without repeats, and filters by year and month', async () => {
    const w = await world();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      // Sequential by nature: each page needs the previous cursor.
      const page: Awaited<ReturnType<typeof contentOf>> = await contentOf(
        w.owner,
        w.owner,
        `?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...page.items.map(keyOf));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen).toEqual(await keys(w.owner, w.owner));
    const now = new Date();
    expect(
      await keys(
        w.owner,
        w.owner,
        `?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`,
      ),
    ).toEqual(seen);
    expect(await keys(w.owner, w.owner, '?year=1999')).toEqual([]);
    await expectError(
      await rooms.as(w.owner).get(`/rooms/${w.owner.username}/content?month=2`),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('costs a fixed number of queries per page, whatever its size', async () => {
    const w = await world();
    for (let index = 0; index < 6; index += 1) {
      const photo = await postPhoto(w.owner, w.alpha.id);
      await photoPost(w.owner, w.alpha.id, [photo]);
      await updates.shareTo(w.owner, [w.alpha.id, w.bravo.id]);
    }
    const read =
      (path: string, limit: number, expected: number) => async () => {
        const body = (await json(
          await rooms
            .as(w.alphaFriend)
            .get(`/rooms/${w.owner.username}/${path}?limit=${limit}`),
        )) as { items: unknown[] };
        expect(body.items).toHaveLength(expected);
      };
    const small = await countQueries(read('content', 2, 2));
    const large = await countQueries(read('content', 12, 12));
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(17);
    expect(await countQueries(read('photos', 6, 6))).toBe(
      await countQueries(read('photos', 2, 2)),
    );
    const summary = await countQueries(async () => {
      await summaryOf(w.alphaFriend, w.owner);
    });
    expect(summary).toBeLessThanOrEqual(3);
  });
});

describe('denial parity with GET /rooms/{username}', () => {
  async function shape(response: Response) {
    const headers = Object.fromEntries(
      [...response.headers.entries()].filter(
        ([name]) => !['x-request-id', 'date', 'etag'].includes(name),
      ),
    );
    const body = (await response.json()) as { error: { requestId?: string } };
    delete body.error.requestId;
    return { status: response.status, headers, body };
  }

  it('answers every denial reason on every content route byte-identically', async () => {
    const viewer = await app.person('viewer');
    const make = async (prepare: (owner: TestUser) => Promise<void>) => {
      const owner = await app.person('owner');
      await scene.say(owner, (await scene.newBox(owner)).id, 'private');
      await prepare(owner);
      return owner.username;
    };
    const names = [
      uniqueUsername('missing'),
      '%%%'.repeat(40),
      await make(() => Promise.resolve()),
      await make(async (owner) => {
        await rooms.befriend(owner, viewer);
        await rooms.patchRoom(owner, { visibility: 'hidden' });
      }),
      await make(async (owner) => {
        await rooms.sharedBox(owner, viewer);
      }),
      await make(async (owner) => {
        await rooms.befriend(owner, viewer);
        await rooms.block(owner, viewer);
      }),
      await make(async (owner) => {
        await rooms.befriend(owner, viewer);
        await rooms.block(viewer, owner);
      }),
      await make(async (owner) => {
        await rooms.befriend(owner, viewer);
        await app.database
          .update(users)
          .set({ status: 'suspended' })
          .where(eq(users.id, owner.id));
      }),
    ];
    const reference = await shape(await rooms.roomOf(viewer, names[0] ?? ''));
    expect(reference.status).toBe(404);
    for (const name of names) {
      for (const path of [
        '',
        '/content',
        '/content?type=posts&year=2026',
        '/content/summary',
        '/photos?limit=3',
      ]) {
        const response = await rooms
          .as(viewer)
          .get(`/rooms/${encodeURIComponent(name)}${path}`);
        expect(await shape(response)).toEqual(reference);
      }
    }
  });
});
