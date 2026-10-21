import { lifeUpdates, posts } from '@paldora/database';
import {
  memoryPageSchema,
  memorySummarySchema,
  type MemoryItemView,
} from '@paldora/validation';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../test-support/http.js';
import { lifeUpdateTools } from '../test-support/life-updates.js';
import { countQueries } from '../test-support/query-count.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
let tools: ReturnType<typeof lifeUpdateTools>;
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
  tools = lifeUpdateTools(app);
});
afterAll(() => app.close());

/** The current UTC year and month: content made now lands there. */
const now = new Date();
const thisMonth = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;

const memories = async (user: TestUser, query = thisMonth) =>
  memoryPageSchema.parse(
    await json(await scene.as(user).get(`/me/memories?${query}`)),
  );
const boxMemories = async (user: TestUser, boxId: string, query = thisMonth) =>
  memoryPageSchema.parse(
    await json(await scene.as(user).get(`/boxes/${boxId}/memories?${query}`)),
  );
const summary = async (user: TestUser, path = '/me/memories/summary') =>
  memorySummarySchema.parse(await json(await scene.as(user).get(path)));

const keyOf = (item: MemoryItemView) =>
  item.kind === 'post'
    ? `post:${item.post.id}`
    : `life_update:${item.lifeUpdate.id}`;
const keys = (page: { items: readonly MemoryItemView[] }) =>
  page.items.map(keyOf);
const contextBoxes = (page: { items: readonly MemoryItemView[] }) =>
  page.items.flatMap((item) =>
    item.kind === 'life_update'
      ? [item.lifeUpdate.contexts.map((context) => context.box.name)]
      : [],
  );

/** Every item, page by page; fails on a repeat. */
async function everyPage(
  read: (query: string) => ReturnType<typeof memories>,
  base: string,
  limit: number,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    // Sequential by nature: each page needs the previous cursor.
    const page: Awaited<ReturnType<typeof memories>> = await read(
      `${base}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    seen.push(...keys(page));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 60);
  expect(new Set(seen).size).toBe(seen.length);
  return seen;
}

/** An author with Boxes Alpha and bravo, a member of Alpha, a stranger. */
async function circle() {
  const [author, member, stranger] = (await Promise.all(
    ['author', 'member', 'stranger'].map((name) => app.person(name)),
  )) as [TestUser, TestUser, TestUser];
  const alpha = await scene.newBox(author, 'Alpha');
  const bravo = await scene.newBox(author, 'bravo');
  await scene.join(author, alpha.id, member);
  return { author, member, stranger, alpha, bravo };
}

/** A post, a Life Update to both Boxes, and an Only Me one, in that order. */
async function content(c: Awaited<ReturnType<typeof circle>>) {
  const post = await scene.say(c.author, c.alpha.id, 'a memory');
  const shared = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
  const onlyMe = await tools.keepPrivate(c.author);
  return { post, shared, onlyMe };
}

/** Moves an ordinary post to an exact instant (microseconds kept). */
const backdate = (postId: string, at: string) =>
  app.database
    .update(posts)
    .set({ createdAt: sql`${at}::timestamptz` })
    .where(eq(posts.id, postId));

describe('personal Memories', () => {
  it('list what each viewer can access, newest first, a Life Update once', async () => {
    const c = await circle();
    const { post, shared, onlyMe } = await content(c);
    expect(keys(await memories(c.author))).toEqual([
      `life_update:${onlyMe.id}`,
      `life_update:${shared.id}`,
      `post:${post.id}`,
    ]);
    expect(contextBoxes(await memories(c.author))).toEqual([
      [],
      ['Alpha', 'bravo'],
    ]);
    // A member of Alpha only: no Only Me, and only Alpha's context.
    const forMember = await memories(c.member);
    expect(keys(forMember)).toEqual([
      `life_update:${shared.id}`,
      `post:${post.id}`,
    ]);
    expect(contextBoxes(forMember)).toEqual([['Alpha']]);
    const serialized = JSON.stringify(forMember);
    expect(serialized).not.toContain(c.bravo.id);
    expect(serialized).not.toContain(onlyMe.id);
    expect((await memories(c.stranger)).items).toEqual([]);
    const [first] = forMember.items;
    expect(first?.occurredAt).toBe(shared.createdAt);
  });

  it('filter by type', async () => {
    const c = await circle();
    const { post, shared, onlyMe } = await content(c);
    expect(keys(await memories(c.author, `${thisMonth}&type=posts`))).toEqual([
      `post:${post.id}`,
    ]);
    expect(
      keys(await memories(c.author, `${thisMonth}&type=life_updates`)),
    ).toEqual([`life_update:${onlyMe.id}`, `life_update:${shared.id}`]);
  });

  it('are derived: edits show at once, and deleting removes the item at once', async () => {
    const c = await circle();
    const { post, shared, onlyMe } = await content(c);
    await json(
      await scene
        .as(c.author)
        .patch(`/life-updates/${shared.id}`, { sections: { travel: 'Oslo' } }),
    );
    const edited = (await memories(c.member)).items.find(
      (item) => item.kind === 'life_update',
    );
    expect(
      edited?.kind === 'life_update' &&
        edited.lifeUpdate.sections.map((section) => section.content),
    ).toEqual(['Oslo']);
    await ok(await scene.as(c.author).delete(`/posts/${post.id}`));
    await ok(await scene.as(c.author).delete(`/life-updates/${shared.id}`));
    expect(keys(await memories(c.member))).toEqual([]);
    expect(keys(await memories(c.author))).toEqual([
      `life_update:${onlyMe.id}`,
    ]);
    await ok(await scene.as(c.author).delete(`/life-updates/${onlyMe.id}`));
    expect((await memories(c.author)).items).toEqual([]);
    expect(await summary(c.author)).toEqual({
      years: [],
      year: null,
      months: [],
    });
  });

  it('follow current membership: leaving or removal takes the Box’s content away', async () => {
    const c = await circle();
    const removed = await app.person('removed');
    await scene.join(c.author, c.alpha.id, removed);
    await content(c);
    expect((await memories(c.member)).items).toHaveLength(2);
    expect((await memories(removed)).items).toHaveLength(2);
    await ok(
      await scene.as(c.member).delete(`/boxes/${c.alpha.id}/members/me`),
    );
    await ok(
      await scene
        .as(c.author)
        .delete(`/boxes/${c.alpha.id}/members/${removed.id}`),
    );
    for (const former of [c.member, removed]) {
      expect((await memories(former)).items).toEqual([]);
      expect((await summary(former)).years).toEqual([]);
      await expectError(
        await scene
          .as(former)
          .get(`/boxes/${c.alpha.id}/memories?${thisMonth}`),
        404,
        'BOX_NOT_FOUND',
      );
    }
  });

  it('keep an archived Box’s content, read-only', async () => {
    const c = await circle();
    const { post, shared } = await content(c);
    await json(
      await scene
        .as(c.author)
        .patch(`/boxes/${c.alpha.id}`, { status: 'archived' }),
    );
    const page = await boxMemories(c.member, c.alpha.id);
    expect(keys(page)).toEqual([`life_update:${shared.id}`, `post:${post.id}`]);
    for (const item of page.items) {
      const interactions =
        item.kind === 'post'
          ? item.post.interactions
          : item.lifeUpdate.contexts[0]?.interactions;
      expect(interactions?.canInteract).toBe(false);
    }
  });
});

describe('Box Memories', () => {
  it('hold that Box’s content only, each Life Update with that Box’s context', async () => {
    const c = await circle();
    const { post, shared } = await content(c);
    const alpha = await boxMemories(c.author, c.alpha.id);
    expect(keys(alpha)).toEqual([
      `life_update:${shared.id}`,
      `post:${post.id}`,
    ]);
    expect(contextBoxes(alpha)).toEqual([['Alpha']]);
    const bravo = await boxMemories(c.author, c.bravo.id);
    expect(keys(bravo)).toEqual([`life_update:${shared.id}`]);
    expect(contextBoxes(bravo)).toEqual([['bravo']]);
    expect(JSON.stringify(alpha)).not.toContain(c.bravo.id);
    const counts = await summary(
      c.author,
      `/boxes/${c.alpha.id}/memories/summary`,
    );
    expect(counts.months).toEqual([{ month: now.getUTCMonth() + 1, count: 2 }]);
  });

  it('answer BOX_NOT_FOUND to a stranger and a guessed Box, and reject malformed input', async () => {
    const c = await circle();
    await content(c);
    for (const path of [
      `/boxes/${c.alpha.id}/memories?${thisMonth}`,
      `/boxes/${c.alpha.id}/memories/summary`,
    ]) {
      await expectError(
        await scene.as(c.stranger).get(path),
        404,
        'BOX_NOT_FOUND',
      );
    }
    for (const path of [
      `/boxes/${randomUUID()}/memories?${thisMonth}`,
      `/boxes/${randomUUID()}/memories/summary`,
    ]) {
      await expectError(
        await scene.as(c.author).get(path),
        404,
        'BOX_NOT_FOUND',
      );
    }
    for (const path of [
      `/boxes/not-a-uuid/memories?${thisMonth}`,
      '/me/memories',
      '/me/memories?year=1969',
      '/me/memories?year=2026&month=13',
      '/me/memories?year=2026&type=comments',
      '/me/memories?year=2026&cursor=bm90LWEtY3Vyc29y',
      '/me/memories?year=2026&limit=51',
      '/me/memories/summary?year=abc',
    ]) {
      await expectError(
        await scene.as(c.author).get(path),
        400,
        'VALIDATION_FAILED',
      );
    }
  });
});

describe('blocks (ADR 013, Phase 6 decision 15)', () => {
  it('omit the other person’s content in both directions, until unblocked', async () => {
    for (const direction of ['author blocks', 'member blocks'] as const) {
      const c = await circle();
      const { post, shared } = await content(c);
      const [blocker, blocked] =
        direction === 'author blocks'
          ? [c.author, c.member]
          : [c.member, c.author];
      await json(
        await scene.as(blocker).post('/blocks', { username: blocked.username }),
        201,
      );
      const memberView = async () => ({
        mine: keys(await memories(c.member)),
        box: keys(await boxMemories(c.member, c.alpha.id)),
        counts: (await summary(c.member)).years,
      });
      // Omitted: no placeholder, no count.
      expect(await memberView()).toEqual({ mine: [], box: [], counts: [] });
      // The author's own content is unaffected for the author.
      expect(keys(await memories(c.author))).toHaveLength(3);
      await ok(await scene.as(blocker).delete(`/blocks/${blocked.id}`));
      expect((await memberView()).mine).toEqual([
        `life_update:${shared.id}`,
        `post:${post.id}`,
      ]);
    }
  });
});

describe('UTC months', () => {
  it('put the last microsecond of a month in it and midnight in the next', async () => {
    const c = await circle();
    const instants = [
      '2024-12-31T23:59:59.999999Z',
      '2025-01-01T00:00:00.000000Z',
      '2028-02-29T23:59:59.999999Z',
      '2028-03-01T00:00:00.000000Z',
    ];
    const made = [];
    for (const at of instants) {
      const post = await scene.say(c.author, c.bravo.id, at);
      await backdate(post.id, at);
      made.push(`post:${post.id}`);
    }
    const [dec31, jan1, feb29, mar1] = made;
    const page = (query: string) => boxMemories(c.author, c.bravo.id, query);
    expect(keys(await page('year=2024&month=12'))).toEqual([dec31]);
    expect(keys(await page('year=2025&month=1'))).toEqual([jan1]);
    expect(keys(await page('year=2024'))).toEqual([dec31]);
    expect(keys(await page('year=2025'))).toEqual([jan1]);
    expect(keys(await page('year=2028&month=2'))).toEqual([feb29]);
    expect(keys(await page('year=2028&month=3'))).toEqual([mar1]);
    expect(keys(await page('year=2028'))).toEqual([mar1, feb29]);
    expect((await page('year=2028&month=2')).items[0]?.occurredAt).toBe(
      '2028-02-29T23:59:59.999Z',
    );
    const counts = await summary(
      c.author,
      `/boxes/${c.bravo.id}/memories/summary`,
    );
    expect(counts.years).toEqual([
      { year: 2028, count: 2 },
      { year: 2025, count: 1 },
      { year: 2024, count: 1 },
    ]);
    expect(counts.year).toBe(2028);
    expect(counts.months).toEqual([
      { month: 3, count: 1 },
      { month: 2, count: 1 },
    ]);
    expect(
      (await summary(c.author, '/me/memories/summary?year=2024')).months,
    ).toEqual([{ month: 12, count: 1 }]);
  });

  it('do not depend on the session time zone', async () => {
    const c = await circle();
    const post = await scene.say(c.author, c.bravo.id);
    await backdate(post.id, '2026-03-31T23:30:00.000000Z');
    // A connection in a zone ahead of UTC sees the same March.
    const rows = await app.database.transaction(async (transaction) => {
      await transaction.execute(sql`set local time zone 'Europe/Istanbul'`);
      return transaction
        .select({ id: posts.id })
        .from(posts)
        .where(
          sql`${posts.id} = ${post.id} and ${posts.createdAt} >= make_timestamptz(2026, 3, 1, 0, 0, 0, 'UTC') and ${posts.createdAt} < make_timestamptz(2026, 4, 1, 0, 0, 0, 'UTC')`,
        );
    });
    expect(rows).toHaveLength(1);
    expect(
      keys(await boxMemories(c.author, c.bravo.id, 'year=2026&month=3')),
    ).toEqual([`post:${post.id}`]);
  });
});

describe('paging', () => {
  it('pages identical timestamps by ID, each item once', async () => {
    const c = await circle();
    const ids: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      ids.push((await scene.say(c.author, c.bravo.id)).id);
    }
    await app.database
      .update(posts)
      .set({ createdAt: sql`'2027-06-15T12:00:00.123456Z'::timestamptz` })
      .where(inArray(posts.id, ids));
    const seen = await everyPage(
      (query) => boxMemories(c.author, c.bravo.id, query),
      'year=2027&month=6',
      2,
    );
    expect(seen).toEqual(
      [...ids]
        .sort()
        .reverse()
        .map((id) => `post:${id}`),
    );
  });

  it('pages a mix of posts and multi-Box Life Updates without repeats, matching the summary', async () => {
    const c = await circle();
    const expected: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const post = await scene.say(c.author, c.alpha.id);
      const shared = await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
      expected.unshift(`life_update:${shared.id}`, `post:${post.id}`);
    }
    const onlyMe = await tools.keepPrivate(c.author);
    expected.unshift(`life_update:${onlyMe.id}`);
    const seen = await everyPage(
      (query) => memories(c.author, query),
      thisMonth,
      2,
    );
    expect(seen).toEqual(expected);
    const counts = await summary(c.author);
    expect(counts.months).toEqual([
      { month: now.getUTCMonth() + 1, count: expected.length },
    ]);
    // Life Updates are stored once: one row each, never copied per Box.
    const stored = await app.database
      .select({ id: lifeUpdates.id })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.authorUserId, c.author.id));
    expect(stored).toHaveLength(5);
  });

  it('costs a fixed number of queries per page, whatever its size', async () => {
    const c = await circle();
    for (let index = 0; index < 10; index += 1) {
      await scene.say(c.author, c.alpha.id);
      await tools.shareTo(c.author, [c.alpha.id, c.bravo.id]);
    }
    const page = (user: TestUser, limit: number) => async () => {
      const read = await memories(user, `${thisMonth}&limit=${limit}`);
      expect(read.items).toHaveLength(limit);
    };
    const small = await countQueries(page(c.author, 2));
    const large = await countQueries(page(c.author, 20));
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(16);
    const box = (limit: number) => async () => {
      const read = await boxMemories(
        c.member,
        c.alpha.id,
        `${thisMonth}&limit=${limit}`,
      );
      expect(read.items).toHaveLength(limit);
    };
    expect(await countQueries(box(20))).toBe(await countQueries(box(2)));
  });
});
