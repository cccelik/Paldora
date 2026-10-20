import {
  boxMemberships,
  boxes,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  postMedia,
  posts,
} from '@paldora/database';
import { mediaUploadSchema, postSchema } from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openStream, type OpenStream } from '../testing/event-stream.js';
import { expectError, json, ok } from '../testing/http.js';
import { lifeUpdateTools } from '../testing/life-updates.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
let tools: ReturnType<typeof lifeUpdateTools>;
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
  tools = lifeUpdateTools(app);
});
afterAll(() => app.close());

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;

/** An author in three Boxes, with one member in each Box and a stranger. */
async function circle() {
  const [author, inAlpha, inBravo, inBoth, stranger] = (await Promise.all(
    ['author', 'alpha', 'bravo', 'both', 'stranger'].map((name) =>
      app.person(name),
    ),
  )) as [TestUser, TestUser, TestUser, TestUser, TestUser];
  const charlie = await scene.newBox(author, 'charlie');
  const alpha = await scene.newBox(author, 'Alpha');
  const bravo = await scene.newBox(author, 'bravo');
  await scene.join(author, alpha.id, inAlpha);
  await scene.join(author, bravo.id, inBravo);
  await scene.join(author, alpha.id, inBoth);
  await scene.join(author, bravo.id, inBoth);
  return { author, inAlpha, inBravo, inBoth, stranger, alpha, bravo, charlie };
}

/** Rows a failed publish must not leave behind. */
async function rowsBy(author: TestUser) {
  const [updates] = await app.database
    .select({ count: sql<number>`count(*)::int` })
    .from(lifeUpdates)
    .where(eq(lifeUpdates.authorUserId, author.id));
  const [backing] = await app.database
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(eq(posts.authorUserId, author.id), eq(posts.kind, 'life_update')),
    );
  return { updates: updates?.count, backing: backing?.count };
}

describe('publishing', () => {
  it('stores it once with one backing post per Box, all at one instant', async () => {
    const { author, alpha, bravo, charlie } = await circle();
    const published = await tools.shareTo(author, [
      charlie.id,
      alpha.id,
      bravo.id,
    ]);
    expect(published.audience).toBe('boxes');
    expect(published.canEdit).toBe(true);
    expect(published.sections).toEqual([
      { key: 'lifeLately', label: 'Life lately', content: 'Busy, happy.' },
    ]);
    // Alphabetical, ignoring case, whatever the input order.
    expect(published.contexts.map((context) => context.box.name)).toEqual([
      'Alpha',
      'bravo',
      'charlie',
    ]);
    const rows = await app.database
      .select({
        updateAt: sql<string>`${lifeUpdates.createdAt}::text`,
        postAt: sql<string>`${posts.createdAt}::text`,
        postId: posts.id,
        content: posts.content,
        kind: posts.kind,
        position: lifeUpdateDeliveries.position,
        boxId: lifeUpdateDeliveries.boxId,
      })
      .from(lifeUpdateDeliveries)
      .innerJoin(
        lifeUpdates,
        eq(lifeUpdates.id, lifeUpdateDeliveries.lifeUpdateId),
      )
      .innerJoin(posts, eq(posts.id, lifeUpdateDeliveries.postId))
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, published.id))
      .orderBy(lifeUpdateDeliveries.position);
    // Position is the input order; tabs are sorted only on read.
    expect(rows.map((row) => row.boxId)).toEqual([
      charlie.id,
      alpha.id,
      bravo.id,
    ]);
    expect(new Set(rows.map((row) => row.postId)).size).toBe(3);
    for (const row of rows) {
      expect(row).toMatchObject({ kind: 'life_update', content: null });
      expect(row.postAt).toBe(row.updateAt);
    }
    expect(
      new Set(published.contexts.map((context) => context.postId)),
    ).toEqual(new Set(rows.map((row) => row.postId)));
  });

  it('keeps Only Me private, with no backing post and no contexts', async () => {
    const author = await app.person('private');
    const before = await rowsBy(author);
    const kept = await tools.keepPrivate(author);
    expect(kept).toMatchObject({ audience: 'only_me', contexts: [] });
    expect(await rowsBy(author)).toEqual({
      updates: (before.updates ?? 0) + 1,
      backing: before.backing,
    });
    expect((await tools.view(author, kept.id)).id).toBe(kept.id);
  });

  it('accepts 20 Boxes and rejects 21 or the same Box twice', async () => {
    const author = await app.person('wide');
    // Straight to the database: 21 Boxes would trip the Box-create limit.
    const created = await app.database
      .insert(boxes)
      .values(
        Array.from({ length: 21 }, (_, index) => ({ name: `Box ${index}` })),
      )
      .returning({ id: boxes.id });
    const ids = created.map((box) => box.id);
    await app.database.insert(boxMemberships).values(
      ids.map((boxId) => ({
        boxId,
        userId: author.id,
        role: 'owner' as const,
      })),
    );
    const wide = await tools.shareTo(author, ids.slice(0, 20));
    expect(wide.contexts).toHaveLength(20);
    const sections = { travel: 'x' };
    await expectError(
      await tools.publish(author, {
        audience: { type: 'boxes', boxIds: ids },
        sections,
      }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await tools.publish(author, {
        audience: {
          type: 'boxes',
          boxIds: [ids[0], ids[0]?.toUpperCase()],
        },
        sections,
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('fails as a whole for a Box the author is not in, without saying which', async () => {
    const { author, alpha, stranger } = await circle();
    const theirs = await scene.newBox(stranger, unique('theirs'));
    for (const boxIds of [
      [alpha.id, theirs.id],
      [alpha.id, randomUUID()],
    ]) {
      await expectError(
        await tools.publish(author, {
          audience: { type: 'boxes', boxIds },
          sections: { travel: 'x' },
        }),
        404,
        'BOX_NOT_FOUND',
      );
    }
    expect(await rowsBy(author)).toEqual({ updates: 0, backing: 0 });
  });

  it('fails as a whole when one Box is archived, or the author left one', async () => {
    const { author, inAlpha, alpha, bravo } = await circle();
    await json(
      await scene
        .as(author)
        .patch(`/boxes/${bravo.id}`, { status: 'archived' }),
    );
    await expectError(
      await tools.publish(author, {
        audience: { type: 'boxes', boxIds: [alpha.id, bravo.id] },
        sections: { travel: 'x' },
      }),
      409,
      'BOX_ARCHIVED',
    );
    expect(await rowsBy(author)).toEqual({ updates: 0, backing: 0 });
    await ok(await scene.as(inAlpha).delete(`/boxes/${alpha.id}/members/me`));
    await expectError(
      await tools.publish(inAlpha, {
        audience: { type: 'boxes', boxIds: [alpha.id] },
        sections: { travel: 'x' },
      }),
      404,
      'BOX_NOT_FOUND',
    );
  });

  it('rejects an empty update and an audience it does not understand', async () => {
    const author = await app.person('empty');
    for (const body of [
      { audience: { type: 'only_me' } },
      { audience: { type: 'only_me' }, sections: { travel: '   ' } },
      { audience: { type: 'everyone' }, sections: { travel: 'x' } },
      { sections: { travel: 'x' } },
      { audience: { type: 'only_me' }, sections: { mood: 'x' } },
    ]) {
      await expectError(
        await tools.publish(author, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    expect(await rowsBy(author)).toEqual({ updates: 0, backing: 0 });
  });
});

describe('photos', () => {
  it('reserves Life Update photos without a Box', async () => {
    const author = await app.person('reserve');
    const reserve = (body: Record<string, unknown>) =>
      scene.as(author).post('/media/uploads', {
        purpose: 'life_update_image',
        contentType: 'image/jpeg',
        contentLength: 2_048,
        ...body,
      });
    const upload = mediaUploadSchema.parse(await json(await reserve({}), 201));
    expect(upload.mediaAsset.purpose).toBe('life_update_image');
    await expectError(
      await reserve({ boxId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('claims ready photos once and shows the same photos in every Box', async () => {
    const { author, inAlpha, inBravo, alpha, bravo } = await circle();
    const first = await tools.photo(author);
    const second = await tools.photo(author);
    const published = await tools.shareTo(author, [alpha.id, bravo.id], {
      mediaAssetIds: [second.id, first.id],
    });
    expect(published.media.map((photo) => photo.id)).toEqual([
      second.id,
      first.id,
    ]);
    for (const member of [inAlpha, inBravo]) {
      const seen = await tools.view(member, published.id);
      expect(seen.media.map((photo) => photo.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(seen.media[0]?.url).not.toContain(second.keys.masterObjectKey);
    }
    const links = await app.database
      .select()
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.lifeUpdateId, published.id));
    expect(links).toHaveLength(2);
  });

  it('refuses photos that are not ready, not yours, used, or of another purpose', async () => {
    const { author, alpha, stranger } = await circle();
    const send = (mediaAssetIds: string[]) =>
      tools.publish(author, {
        audience: { type: 'only_me' },
        sections: { travel: 'x' },
        mediaAssetIds,
      });
    const processing = await tools.photo(author, {
      status: 'processing',
      masterObjectKey: null,
      displayObjectKey: null,
      thumbnailObjectKey: null,
      width: null,
      height: null,
    });
    await expectError(await send([processing.id]), 409, 'MEDIA_NOT_READY');
    const theirs = await tools.photo(stranger);
    await expectError(await send([theirs.id]), 404, 'MEDIA_NOT_FOUND');
    const used = await tools.photo(author);
    await tools.keepPrivate(author, { mediaAssetIds: [used.id] });
    await expectError(await send([used.id]), 404, 'MEDIA_NOT_FOUND');
    const postPhoto = await scene.cameraImage(author, alpha.id, {
      purpose: 'post_image',
    });
    await expectError(await send([postPhoto]), 404, 'MEDIA_NOT_FOUND');
    await expectError(await send([randomUUID()]), 404, 'MEDIA_NOT_FOUND');
  });

  it('lets one of two racing publishes claim a photo', async () => {
    const author = await app.person('racer');
    const shared = await tools.photo(author);
    const body = {
      audience: { type: 'only_me' },
      sections: { travel: 'x' },
      mediaAssetIds: [shared.id],
    };
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => tools.publish(author, body)),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 404, 404, 404]);
    const links = await app.database
      .select()
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.mediaAssetId, shared.id));
    expect(links).toHaveLength(1);
    // The losers left nothing behind.
    expect((await rowsBy(author)).updates).toBe(1);
  });

  it('keeps post photos and Life Update photos apart', async () => {
    const { author, alpha } = await circle();
    const lifePhoto = await tools.photo(author);
    await expectError(
      await scene.as(author).post(`/boxes/${alpha.id}/posts`, {
        content: 'x',
        mediaAssetIds: [lifePhoto.id],
      }),
      404,
      'MEDIA_NOT_FOUND',
    );
    const links = await app.database
      .select()
      .from(postMedia)
      .where(eq(postMedia.mediaAssetId, lifePhoto.id));
    expect(links).toEqual([]);
  });
});

describe('reading', () => {
  it('shows each member only the contexts of their own Boxes', async () => {
    const {
      author,
      inAlpha,
      inBravo,
      inBoth,
      stranger,
      alpha,
      bravo,
      charlie,
    } = await circle();
    const published = await tools.shareTo(author, [
      alpha.id,
      bravo.id,
      charlie.id,
    ]);
    const boxNames = async (user: TestUser) =>
      (await tools.view(user, published.id)).contexts.map(
        (context) => context.box.id,
      );
    expect(await boxNames(inAlpha)).toEqual([alpha.id]);
    expect(await boxNames(inBravo)).toEqual([bravo.id]);
    expect(await boxNames(inBoth)).toEqual([alpha.id, bravo.id]);
    const seen = await tools.view(inAlpha, published.id);
    expect(seen.canEdit).toBe(false);
    for (const [user, id] of [
      [stranger, published.id],
      [author, randomUUID()],
    ] as const) {
      await expectError(
        await scene.as(user).get(`/life-updates/${id}`),
        404,
        'LIFE_UPDATE_NOT_FOUND',
      );
    }
    await expectError(
      await scene.as(author).get('/life-updates/not-a-uuid'),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('hides Only Me from everyone but the author', async () => {
    const { author, inAlpha } = await circle();
    const kept = await tools.keepPrivate(author);
    await expectError(
      await scene.as(inAlpha).get(`/life-updates/${kept.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });

  it('follows current membership, for members and the author alike', async () => {
    const { author, inAlpha, inBoth, alpha, bravo } = await circle();
    const published = await tools.shareTo(author, [alpha.id]);
    await ok(await scene.as(inAlpha).delete(`/boxes/${alpha.id}/members/me`));
    await expectError(
      await scene.as(inAlpha).get(`/life-updates/${published.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    await ok(
      await scene.as(author).delete(`/boxes/${alpha.id}/members/${inBoth.id}`),
    );
    await expectError(
      await scene.as(inBoth).get(`/life-updates/${published.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    // An author who left every delivery Box loses it too (decision 7).
    const leaver = await app.person('leaver');
    await scene.join(author, bravo.id, leaver);
    const theirs = await tools.shareTo(leaver, [bravo.id]);
    await ok(await scene.as(leaver).delete(`/boxes/${bravo.id}/members/me`));
    await expectError(
      await scene.as(leaver).get(`/life-updates/${theirs.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    expect((await tools.mine(leaver)).items).toEqual([]);
    expect((await tools.view(author, theirs.id)).id).toBe(theirs.id);
  });

  it('stays readable but frozen in an archived Box', async () => {
    const { author, inAlpha, alpha } = await circle();
    const published = await tools.shareTo(author, [alpha.id]);
    await json(
      await scene
        .as(author)
        .patch(`/boxes/${alpha.id}`, { status: 'archived' }),
    );
    const seen = await tools.view(inAlpha, published.id);
    expect(seen.contexts[0]?.interactions.canInteract).toBe(false);
    expect((await tools.view(author, published.id)).canEdit).toBe(false);
  });

  it('answers not found in both block directions, and returns after unblock', async () => {
    const { author, inAlpha, inBravo, alpha, bravo } = await circle();
    const published = await tools.shareTo(author, [alpha.id, bravo.id]);
    const blockFrom = async (blocker: TestUser, target: TestUser) =>
      json(
        await scene.as(blocker).post('/blocks', { username: target.username }),
        201,
      );
    await blockFrom(author, inAlpha);
    await blockFrom(inBravo, author);
    for (const viewer of [inAlpha, inBravo]) {
      await expectError(
        await scene.as(viewer).get(`/life-updates/${published.id}`),
        404,
        'LIFE_UPDATE_NOT_FOUND',
      );
    }
    // The author's own view is unaffected.
    expect((await tools.view(author, published.id)).contexts).toHaveLength(2);
    await ok(await scene.as(author).delete(`/blocks/${inAlpha.id}`));
    expect((await tools.view(inAlpha, published.id)).id).toBe(published.id);
  });

  it('keeps each Box’s conversation on its own backing post', async () => {
    const { author, inAlpha, inBoth, alpha, bravo } = await circle();
    const published = await tools.shareTo(author, [alpha.id, bravo.id]);
    const contextOf = (
      view: Awaited<ReturnType<typeof tools.view>>,
      boxId: string,
    ) => view.contexts.find((context) => context.box.id === boxId);
    const alphaPost = contextOf(published, alpha.id)?.postId ?? '';
    await scene.comment(inAlpha, alphaPost, 'only in Alpha');
    await scene.reactToPost(inAlpha, alphaPost);
    const seen = await tools.view(inBoth, published.id);
    expect(contextOf(seen, alpha.id)?.interactions).toMatchObject({
      commentCount: 1,
      reactionCount: 1,
    });
    expect(contextOf(seen, bravo.id)?.interactions).toMatchObject({
      commentCount: 0,
      reactionCount: 0,
    });
    // A backing post reads as a post with no content of its own.
    const backing = postSchema.parse(
      await json(await scene.as(inAlpha).get(`/posts/${alphaPost}`)),
    );
    expect(backing).toMatchObject({ content: '', media: [] });
  });
});

describe('listing your own', () => {
  it('pages newest first through Only Me and Box updates, never others’', async () => {
    const { author, inAlpha, alpha } = await circle();
    const first = await tools.shareTo(author, [alpha.id]);
    const second = await tools.keepPrivate(author);
    const third = await tools.shareTo(author, [alpha.id]);
    await tools.shareTo(inAlpha, [alpha.id]);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof tools.mine>> = await tools.mine(
        author,
        `?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([third.id, second.id, first.id]);
    await expectError(
      await scene.as(author).get('/me/life-updates?cursor=nope'),
      400,
      'VALIDATION_FAILED',
    );
  });
});

describe('realtime hints', () => {
  const streams: OpenStream[] = [];
  afterEach(() => {
    for (const stream of streams.splice(0)) stream.close();
  });

  async function listen(user: TestUser) {
    const stream = await openStream(app.baseUrl, user.token);
    streams.push(stream);
    await stream.waitFor((event) => event.type === 'resync');
    return stream;
  }

  it('announce each backing post to its own Box only, after commit', async () => {
    const { author, inAlpha, stranger, alpha, bravo } = await circle();
    const member = await listen(inAlpha);
    const outsider = await listen(stranger);
    const published = await tools.shareTo(author, [alpha.id, bravo.id]);
    const alphaPost = published.contexts.find(
      (context) => context.box.id === alpha.id,
    )?.postId;
    const event = await member.waitFor(
      (candidate) => candidate.type === 'post.created',
    );
    expect(event).toMatchObject({ boxId: alpha.id, postId: alphaPost });
    await outsider.expectNone((candidate) => candidate.type === 'post.created');
  });

  it('announce nothing for Only Me', async () => {
    const author = await app.person('quiet');
    const box = await scene.newBox(author, unique('quiet'));
    const stream = await listen(author);
    await tools.keepPrivate(author);
    await stream.expectNone(
      (candidate) =>
        candidate.type === 'post.created' && candidate.boxId === box.id,
    );
  });
});

describe('rate limits', () => {
  it('allows 30 publishes an hour', async () => {
    const author = await app.person('prolific');
    for (let index = 0; index < 30; index += 1) {
      // Sequential, so the limiter sees the requests in order.
      await json(
        await tools.publish(author, {
          audience: { type: 'only_me' },
          sections: { travel: `${index}` },
        }),
        201,
      );
    }
    await expectError(
      await tools.publish(author, {
        audience: { type: 'only_me' },
        sections: { travel: 'one more' },
      }),
      429,
      'RATE_LIMITED',
    );
  });
});
