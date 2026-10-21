import { posts } from '@paldora/database';
import { feedPageSchema, postSchema } from '@paldora/validation';
import { eq } from 'drizzle-orm';
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

async function say(user: TestUser, boxId: string, content: string) {
  return postSchema.parse(
    await json(await as(user).post(`/boxes/${boxId}/posts`, { content }), 201),
  );
}

async function feed(user: TestUser, path: string) {
  return feedPageSchema.parse(await json(await as(user).get(path)));
}

/** An owner, an admin, a member, and a stranger around one Box. */
async function room() {
  const [owner, admin, member, stranger] = (await Promise.all(
    ['owner', 'admin', 'member', 'stranger'].map((name) => app.person(name)),
  )) as [TestUser, TestUser, TestUser, TestUser];
  const box = await newBox(owner);
  await join(owner, box.id, admin);
  await join(owner, box.id, member);
  await json(
    await as(owner).patch(`/boxes/${box.id}/members/${admin.id}`, {
      role: 'admin',
    }),
  );
  return { owner, admin, member, stranger, box };
}

describe('writing posts', () => {
  it('lets every role post, trims text, and shows the author', async () => {
    const { owner, admin, member, box } = await room();
    for (const person of [owner, admin, member]) {
      const post = await say(
        person,
        box.id,
        `  hello from ${person.username}  `,
      );
      expect(post.content).toBe(`hello from ${person.username}`);
      expect(post).toMatchObject({
        author: { id: person.id },
        canEdit: true,
        editedAt: null,
      });
    }
  });

  it('rejects empty, oversized, and extra fields', async () => {
    const { owner, box } = await room();
    for (const body of [
      { content: '   ' },
      { content: 'x'.repeat(5001) },
      { content: 'ok', authorUserId: owner.id },
    ]) {
      await expectError(
        await as(owner).post(`/boxes/${box.id}/posts`, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    expect((await say(owner, box.id, 'x'.repeat(5000))).content).toHaveLength(
      5000,
    );
  });

  it('keeps strangers, former members, and guessed Boxes out', async () => {
    const { owner, member, stranger, box } = await room();
    const post = await say(owner, box.id, 'private words');
    for (const id of [box.id, randomUUID()]) {
      await expectError(
        await as(stranger).post(`/boxes/${id}/posts`, { content: 'hi' }),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await as(stranger).get(`/boxes/${id}/posts`),
        404,
        'BOX_NOT_FOUND',
      );
    }
    await expectError(
      await as(stranger).get(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(stranger).get(`/posts/${randomUUID()}`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(stranger).get('/posts/not-a-uuid'),
      400,
      'VALIDATION_FAILED',
    );
    expect((await feed(stranger, '/me/feed')).items).toEqual([]);

    await ok(await as(member).delete(`/boxes/${box.id}/members/me`));
    await expectError(
      await as(member).get(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(member).post(`/boxes/${box.id}/posts`, { content: 'back?' }),
      404,
      'BOX_NOT_FOUND',
    );
  });

  it('is read-only in an archived Box', async () => {
    const { owner, box } = await room();
    const post = await say(owner, box.id, 'before');
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    await expectError(
      await as(owner).post(`/boxes/${box.id}/posts`, { content: 'x' }),
      409,
      'BOX_ARCHIVED',
    );
    await expectError(
      await as(owner).patch(`/posts/${post.id}`, { content: 'y' }),
      409,
      'BOX_ARCHIVED',
    );
    await expectError(
      await as(owner).delete(`/posts/${post.id}`),
      409,
      'BOX_ARCHIVED',
    );
    const read = postSchema.parse(
      await json(await as(owner).get(`/posts/${post.id}`)),
    );
    expect(read).toMatchObject({ content: 'before', canEdit: false });
  });
});

describe('editing and deleting', () => {
  it('lets only the author change a post, even for owners and admins', async () => {
    const { owner, admin, member, box } = await room();
    const post = await say(member, box.id, 'mine');
    for (const other of [owner, admin]) {
      await expectError(
        await as(other).patch(`/posts/${post.id}`, { content: 'hijack' }),
        403,
        'POST_ACCESS_DENIED',
      );
      await expectError(
        await as(other).delete(`/posts/${post.id}`),
        403,
        'POST_ACCESS_DENIED',
      );
    }
    const edited = postSchema.parse(
      await json(
        await as(member).patch(`/posts/${post.id}`, { content: ' better ' }),
      ),
    );
    expect(edited).toMatchObject({ content: 'better' });
    expect(edited.editedAt).not.toBeNull();
  });

  it('erases the text on delete, keeps a tombstone, and is idempotent for the author', async () => {
    const { owner, member, box } = await room();
    const post = await say(member, box.id, 'secret plans');
    await ok(await as(member).delete(`/posts/${post.id}`));
    await ok(await as(member).delete(`/posts/${post.id}`));
    const [row] = await app.database
      .select()
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row).toMatchObject({
      status: 'deleted',
      content: null,
      authorUserId: member.id,
    });
    expect(row?.deletedAt).not.toBeNull();
    await expectError(
      await as(owner).get(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(owner).delete(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(member).patch(`/posts/${post.id}`, { content: 'zombie' }),
      404,
      'POST_NOT_FOUND',
    );
    expect((await feed(owner, `/boxes/${box.id}/posts`)).items).toEqual([]);
  });

  it('decides a simultaneous edit and delete one after the other', async () => {
    const { member, box } = await room();
    const post = await say(member, box.id, 'race');
    const [edit, remove] = await Promise.all([
      as(member).patch(`/posts/${post.id}`, { content: 'edited' }),
      as(member).delete(`/posts/${post.id}`),
    ]);
    expect(remove.status).toBe(204);
    expect([200, 404]).toContain(edit.status);
    const [row] = await app.database
      .select()
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.status).toBe('deleted');
    expect(row?.content).toBeNull();
  });
});

describe('feeds', () => {
  it('lists newest first, across Boxes, and pages without repeats', async () => {
    const { owner, member, box } = await room();
    const other = await newBox(owner, 'Second');
    await join(owner, other.id, member);
    const said: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      // Sequential so creation order is the expected order.
      said.push(
        (
          await say(
            index % 2 ? owner : member,
            index < 3 ? box.id : other.id,
            `post ${index}`,
          )
        ).id,
      );
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof feed>> = await feed(
        member,
        `/me/feed?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(
        ...page.items.map((item) =>
          item.kind === 'post'
            ? item.post.id
            : item.kind === 'hidden'
              ? item.hidden.id
              : item.lifeUpdate.id,
        ),
      );
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 6);
    expect(seen).toEqual([...said].reverse());
    const inBox = await feed(owner, `/boxes/${box.id}/posts`);
    expect(
      inBox.items.every(
        (item) => item.kind === 'post' && item.post.box.id === box.id,
      ),
    ).toBe(true);
  });

  it('shows only the Boxes you are in', async () => {
    const { owner, stranger, box } = await room();
    await say(owner, box.id, 'inside');
    const theirs = await newBox(stranger, 'Elsewhere');
    await say(stranger, theirs.id, 'outside');
    const mine = await feed(owner, '/me/feed');
    expect(JSON.stringify(mine)).toContain('inside');
    expect(JSON.stringify(mine)).not.toContain('outside');
  });
});

describe('blocks hide posts in shared Boxes (D1)', () => {
  it.each([
    ['the viewer blocked the author', 'viewer'],
    ['the author blocked the viewer', 'author'],
  ])('%s', async (_name, blocker) => {
    const { owner, member, box } = await room();
    const post = await say(member, box.id, 'visible to others only');
    const [from, target] =
      blocker === 'viewer' ? [owner, member] : [member, owner];
    await json(
      await as(from).post('/blocks', { username: target.username }),
      201,
    );

    // Both stay in the Box; the viewer sees a neutral placeholder.
    const page = await feed(owner, `/boxes/${box.id}/posts`);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      kind: 'hidden',
      hidden: { id: post.id, boxId: box.id, createdAt: post.createdAt },
    });
    const everything = JSON.stringify([page, await feed(owner, '/me/feed')]);
    for (const leak of [
      'visible to others only',
      member.username,
      member.id,
      'author',
    ]) {
      expect(everything).not.toContain(leak);
    }
    await expectError(
      await as(owner).get(`/posts/${post.id}`),
      404,
      'POST_NOT_FOUND',
    );
    // The author still sees their own post, and a third person sees it too.
    expect(
      postSchema.parse(await json(await as(member).get(`/posts/${post.id}`)))
        .content,
    ).toBe('visible to others only');

    // Unblocking brings it back; blocking again hides it again.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    expect((await feed(owner, `/boxes/${box.id}/posts`)).items[0]?.kind).toBe(
      'post',
    );
    await json(
      await as(from).post('/blocks', { username: target.username }),
      201,
    );
    expect((await feed(owner, `/boxes/${box.id}/posts`)).items[0]?.kind).toBe(
      'hidden',
    );
  });

  it('does not hide posts from people who merely share a Box with a blocked pair', async () => {
    const { owner, admin, member, box } = await room();
    await say(member, box.id, 'for the rest');
    await json(
      await as(owner).post('/blocks', { username: member.username }),
      201,
    );
    expect((await feed(admin, `/boxes/${box.id}/posts`)).items[0]?.kind).toBe(
      'post',
    );
  });
});
