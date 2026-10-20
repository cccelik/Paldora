import {
  lifeUpdateDeliveries,
  lifeUpdates,
  notifications,
  posts,
} from '@paldora/database';
import {
  feedPageSchema,
  notificationPageSchema,
  postSchema,
  type FeedItemView,
  type LifeUpdateView,
} from '@paldora/validation';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../testing/http.js';
import { lifeUpdateTools } from '../testing/life-updates.js';
import { countQueries } from '../testing/query-count.js';
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

const feed = async (user: TestUser, path: string) =>
  feedPageSchema.parse(await json(await scene.as(user).get(path)));

const home = (user: TestUser, query = '') => feed(user, `/me/feed${query}`);
const boxFeed = (user: TestUser, boxId: string, query = '') =>
  feed(user, `/boxes/${boxId}/posts${query}`);

const keyOf = (item: FeedItemView) =>
  item.kind === 'post'
    ? `post:${item.post.id}`
    : item.kind === 'life_update'
      ? `life_update:${item.lifeUpdate.id}`
      : `hidden:${item.hidden.id}`;

const lifeUpdatesIn = (items: readonly FeedItemView[]): LifeUpdateView[] =>
  items.flatMap((item) =>
    item.kind === 'life_update' ? [item.lifeUpdate] : [],
  );

/** Every item of a feed, page by page, `limit` at a time. */
async function everyPage(
  read: (query: string) => ReturnType<typeof home>,
  limit: number,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    // Sequential by nature: each page needs the previous cursor.
    const page: Awaited<ReturnType<typeof home>> = await read(
      `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    seen.push(...page.items.map(keyOf));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 50);
  return seen;
}

/**
 * An author in three Boxes (charlie, Alpha, bravo), a member of Alpha, a
 * member of bravo, a member of both, and a stranger.
 */
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

const postIn = (view: LifeUpdateView, boxId: string) =>
  view.contexts.find((context) => context.box.id === boxId)?.postId ?? '';

describe('Home', () => {
  it('shows a Life Update once, with a tab for each of your Boxes, alphabetically', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [
      c.charlie.id,
      c.alpha.id,
      c.bravo.id,
    ]);
    const tabs = async (user: TestUser) => {
      const found = lifeUpdatesIn((await home(user)).items);
      expect(found.map((view) => view.id)).toEqual([published.id]);
      return found[0]?.contexts.map((context) => context.box.name);
    };
    expect(await tabs(c.author)).toEqual(['Alpha', 'bravo', 'charlie']);
    expect(await tabs(c.inBoth)).toEqual(['Alpha', 'bravo']);
    expect(await tabs(c.inAlpha)).toEqual(['Alpha']);
    expect(await tabs(c.inBravo)).toEqual(['bravo']);
    expect((await home(c.stranger)).items).toEqual([]);
    // Nothing about Boxes the viewer is not in leaves the API.
    const page = JSON.stringify(await home(c.inAlpha));
    for (const leak of [
      c.bravo.id,
      c.charlie.id,
      postIn(published, c.bravo.id),
    ])
      expect(page).not.toContain(leak);
  });

  it('never shows Only Me, which has no backing post', async () => {
    const c = await circle();
    await tools.keepPrivate(c.author);
    expect(lifeUpdatesIn((await home(c.author)).items)).toEqual([]);
    for (const box of [c.alpha, c.bravo, c.charlie]) {
      expect((await boxFeed(c.author, box.id)).items).toEqual([]);
    }
  });

  it('follows current membership', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
    await ok(
      await scene.as(c.inAlpha).delete(`/boxes/${c.alpha.id}/members/me`),
    );
    expect((await home(c.inAlpha)).items).toEqual([]);
    await ok(
      await scene.as(c.inBoth).delete(`/boxes/${c.alpha.id}/members/me`),
    );
    const left = lifeUpdatesIn((await home(c.inBoth)).items);
    expect(left.map((view) => view.id)).toEqual([published.id]);
    expect(left[0]?.contexts.map((context) => context.box.id)).toEqual([
      c.bravo.id,
    ]);
    await expectError(
      await scene.as(c.inAlpha).get(`/boxes/${c.alpha.id}/posts`),
      404,
      'BOX_NOT_FOUND',
    );
  });

  it('drops a deleted Life Update everywhere', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
    await ok(await scene.as(c.author).delete(`/life-updates/${published.id}`));
    expect((await home(c.inBoth)).items).toEqual([]);
    expect((await boxFeed(c.inBoth, c.alpha.id)).items).toEqual([]);
  });
});

describe('Box feeds', () => {
  it('carry only that Box’s delivery, with no other tabs', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
    for (const box of [c.alpha, c.bravo]) {
      const found = lifeUpdatesIn((await boxFeed(c.inBoth, box.id)).items);
      expect(found.map((view) => view.id)).toEqual([published.id]);
      expect(found[0]?.contexts).toEqual([
        expect.objectContaining({
          postId: postIn(published, box.id),
          box: { id: box.id, name: box.name },
        }),
      ]);
    }
  });

  it('show an archived Box’s delivery read-only', async () => {
    const c = await circle();
    await tools.shareTo(c.author, [c.alpha.id]);
    await json(
      await scene
        .as(c.author)
        .patch(`/boxes/${c.alpha.id}`, { status: 'archived' }),
    );
    const [view] = lifeUpdatesIn((await boxFeed(c.inAlpha, c.alpha.id)).items);
    expect(view?.contexts[0]?.interactions.canInteract).toBe(false);
    expect(view?.canEdit).toBe(false);
  });
});

describe('paging', () => {
  it('pages through posts and Life Updates newest first, each once', async () => {
    const c = await circle();
    const expected: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      // Sequential, so the creation order is the feed order.
      const post = await scene.say(c.author, c.alpha.id, `post ${index}`);
      expected.push(`post:${post.id}`);
      const update = await tools.shareTo(c.author, [
        c.alpha.id,
        c.bravo.id,
        c.charlie.id,
      ]);
      expected.push(`life_update:${update.id}`);
    }
    expected.reverse();
    for (const limit of [1, 2, 3]) {
      expect(await everyPage((query) => home(c.inBoth, query), limit)).toEqual(
        expected,
      );
      expect(await everyPage((query) => home(c.author, query), limit)).toEqual(
        expected,
      );
    }
    expect(
      await everyPage((query) => boxFeed(c.inBoth, c.alpha.id, query), 1),
    ).toEqual(expected);
  });

  it('keeps a stable order when posts in several Boxes share the Life Update’s instant', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [
      c.alpha.id,
      c.bravo.id,
      c.charlie.id,
    ]);
    const others = [
      await scene.say(c.inAlpha, c.alpha.id, 'same time, Alpha'),
      await scene.say(c.inBravo, c.bravo.id, 'same time, bravo'),
      await scene.say(c.author, c.charlie.id, 'same time, charlie'),
    ];
    await app.database
      .update(posts)
      .set({
        createdAt: sql`(select ${lifeUpdates.createdAt} from ${lifeUpdates} where ${lifeUpdates.id} = ${published.id})`,
      })
      .where(
        inArray(
          posts.id,
          others.map((post) => post.id),
        ),
      );
    const expectedFor = (visiblePosts: readonly string[]) => [
      `life_update:${published.id}`,
      ...visiblePosts.map((id) => `post:${id}`),
    ];
    const check = async (user: TestUser, visiblePosts: readonly string[]) => {
      const all = await everyPage((query) => home(user, query), 50);
      for (const limit of [1, 2]) {
        const paged = await everyPage((query) => home(user, query), limit);
        expect(paged).toEqual(all);
      }
      expect(new Set(all).size).toBe(all.length);
      expect([...all].sort()).toEqual([...expectedFor(visiblePosts)].sort());
    };
    const [inAlpha, inBravo, inCharlie] = others.map((post) => post.id) as [
      string,
      string,
      string,
    ];
    await check(c.author, [inAlpha, inBravo, inCharlie]);
    await check(c.inBoth, [inAlpha, inBravo]);
    await check(c.inAlpha, [inAlpha]);
  });
});

describe('backing posts', () => {
  it('read as Life Update posts and change only through the Life Update', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [c.alpha.id]);
    const backing = postIn(published, c.alpha.id);
    const seen = postSchema.parse(
      await json(await scene.as(c.inAlpha).get(`/posts/${backing}`)),
    );
    expect(seen).toMatchObject({
      kind: 'life_update',
      lifeUpdateId: published.id,
      content: '',
      media: [],
      canEdit: false,
    });
    const ordinary = await scene.say(c.author, c.alpha.id);
    expect(ordinary).toMatchObject({ kind: 'post', lifeUpdateId: null });

    const patch = (user: TestUser, id: string) =>
      scene.as(user).patch(`/posts/${id}`, { content: 'sneaky' });
    const remove = (user: TestUser, id: string) =>
      scene.as(user).delete(`/posts/${id}`);
    for (const attempt of [patch, remove]) {
      await expectError(
        await attempt(c.author, backing),
        409,
        'POST_MANAGED_BY_LIFE_UPDATE',
      );
      await expectError(
        await attempt(c.inAlpha, backing),
        403,
        'POST_ACCESS_DENIED',
      );
      for (const outsider of [c.stranger, c.inBravo]) {
        await expectError(
          await attempt(outsider, backing),
          404,
          'POST_NOT_FOUND',
        );
      }
    }
    // Still there, untouched.
    const [row] = await app.database
      .select()
      .from(posts)
      .where(eq(posts.id, backing));
    expect(row).toMatchObject({ status: 'active', content: null });
    // After the Life Update is deleted, the author still cannot "delete" it
    // as a post, and others see nothing at all.
    await ok(await scene.as(c.author).delete(`/life-updates/${published.id}`));
    await expectError(
      await remove(c.author, backing),
      409,
      'POST_MANAGED_BY_LIFE_UPDATE',
    );
    await expectError(await remove(c.inAlpha, backing), 404, 'POST_NOT_FOUND');
  });

  it('label notifications with their Life Update', async () => {
    const c = await circle();
    const published = await tools.shareTo(c.author, [c.alpha.id]);
    const backing = postIn(published, c.alpha.id);
    const said = await scene.comment(c.inAlpha, backing, 'lovely');
    await app.database.insert(notifications).values({
      recipientUserId: c.author.id,
      actorUserId: c.inAlpha.id,
      type: 'post.comment',
      postId: backing,
      commentId: said.id,
      dedupeKey: `post.comment:${randomUUID()}`,
    });
    const page = notificationPageSchema.parse(
      await json(await scene.as(c.author).get('/me/notifications')),
    );
    expect(page.items.find((item) => item.postId === backing)).toMatchObject({
      lifeUpdateId: published.id,
      box: { id: c.alpha.id },
    });
  });
});

describe('Box deletion', () => {
  const deleteBox = (owner: TestUser, box: { id: string; name: string }) =>
    scene
      .as(owner)
      .delete(`/boxes/${box.id}?confirmName=${encodeURIComponent(box.name)}`);

  it('tombstones a Life Update that loses its last Box and retires its photos', async () => {
    const c = await circle();
    const photo = await tools.photo(c.author);
    const onlyHere = await tools.shareTo(c.author, [c.alpha.id], {
      mediaAssetIds: [photo.id],
    });
    const kept = await tools.photo(c.author);
    const elsewhereToo = await tools.shareTo(
      c.author,
      [c.alpha.id, c.bravo.id],
      { mediaAssetIds: [kept.id] },
    );
    const mine = await tools.keepPrivate(c.author);
    await ok(await deleteBox(c.author, c.alpha));

    const statusOf = async (id: string) => {
      const [row] = await app.database
        .select()
        .from(lifeUpdates)
        .where(eq(lifeUpdates.id, id));
      return row;
    };
    expect(await statusOf(onlyHere.id)).toMatchObject({
      status: 'deleted',
      sections: {},
    });
    await expectError(
      await scene.as(c.author).get(`/life-updates/${onlyHere.id}`),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    const [retired] = await app.database
      .execute<{
        status: string;
        queued: number;
      }>(
        sql`
      select status,
        (select count(*)::int from paldora.media_job_outbox
          where job_type = 'media.delete'
            and payload -> 'objectKeys' @> ${JSON.stringify(Object.values(photo.keys))}::jsonb) as queued
      from paldora.media_assets where id = ${photo.id}`,
      )
      .then((result) => result.rows);
    expect(retired).toEqual({ status: 'deleted', queued: 1 });

    // The one with another Box only lost this delivery.
    expect((await statusOf(elsewhereToo.id))?.status).toBe('active');
    const survivor = await tools.view(c.inBoth, elsewhereToo.id);
    expect(survivor.contexts.map((context) => context.box.id)).toEqual([
      c.bravo.id,
    ]);
    expect(survivor.media.map((media) => media.id)).toEqual([kept.id]);
    const deliveries = await app.database
      .select({ boxId: lifeUpdateDeliveries.boxId })
      .from(lifeUpdateDeliveries)
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, elsewhereToo.id));
    expect(deliveries).toEqual([{ boxId: c.bravo.id }]);
    expect((await tools.view(c.author, mine.id)).id).toBe(mine.id);
  });

  it('tombstones it when its Boxes are deleted at the same time', async () => {
    const c = await circle();
    const photo = await tools.photo(c.author);
    const published = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id], {
      mediaAssetIds: [photo.id],
    });
    const results = await Promise.all([
      deleteBox(c.author, c.alpha),
      deleteBox(c.author, c.bravo),
    ]);
    expect(results.map((result) => result.status)).toEqual([204, 204]);
    const [row] = await app.database
      .select({ status: lifeUpdates.status })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, published.id));
    expect(row?.status).toBe('deleted');
  });
});

describe('query budget', () => {
  it('serves a Home page of multi-Box Life Updates and posts in a constant number of queries', async () => {
    const c = await circle();
    for (let index = 0; index < 10; index += 1) {
      // Sequential, so items alternate kinds on every page.
      const update = await tools.shareTo(
        c.author,
        [c.alpha.id, c.bravo.id, c.charlie.id],
        { mediaAssetIds: [(await tools.photo(c.author)).id] },
      );
      await scene.comment(c.inBoth, postIn(update, c.alpha.id));
      await scene.reactToPost(c.inBoth, postIn(update, c.bravo.id));
      const post = await scene.say(c.inAlpha, c.alpha.id, `p${index}`);
      await scene.comment(c.inBoth, post.id);
    }
    const page = (user: TestUser, limit: number) => async () => {
      const read = await home(user, `?limit=${limit}`);
      expect(read.items).toHaveLength(limit);
    };
    const small = await countQueries(page(c.author, 2));
    const large = await countQueries(page(c.author, 20));
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(16);
    const box = (limit: number) => async () => {
      const read = await boxFeed(c.inBoth, c.alpha.id, `?limit=${limit}`);
      expect(read.items).toHaveLength(limit);
    };
    expect(await countQueries(box(20))).toBe(await countQueries(box(2)));
  });
});
