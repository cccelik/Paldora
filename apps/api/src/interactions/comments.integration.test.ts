import {
  commentReactions,
  comments,
  mediaAssets,
  mediaJobOutbox,
  notifications,
  postReactions,
} from '@paldora/database';
import {
  commentDetailSchema,
  commentPageSchema,
  commentSchema,
  feedPageSchema,
  type CommentItemView,
} from '@paldora/validation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../testing/http.js';
import { countQueries } from '../testing/query-count.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
});
afterAll(() => app.close());

const as = (user: TestUser) => scene.as(user);
const idOf = (item: CommentItemView) =>
  item.kind === 'comment'
    ? item.comment.id
    : item.kind === 'deleted'
      ? item.deleted.id
      : item.hidden.id;

async function commentRow(id: string) {
  const [row] = await app.database
    .select()
    .from(comments)
    .where(eq(comments.id, id));
  return row;
}

describe('writing comments', () => {
  it('lets every role comment, trims text, and starts with empty interactions', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    for (const person of [owner, admin, member]) {
      const made = await scene.comment(person, post.id, `  hi ${person.id}  `);
      expect(made).toMatchObject({
        postId: post.id,
        parentCommentId: null,
        author: { id: person.id },
        content: `hi ${person.id}`,
        editedAt: null,
        replyCount: 0,
        canEdit: true,
        interactions: { reactions: [], reactionCount: 0, viewerReaction: null },
      });
    }
    expect((await scene.postView(member, post.id)).interactions).toMatchObject({
      commentCount: 3,
      canInteract: true,
    });
  });

  it('rejects empty, oversized, and extra fields and accepts 2,000 characters', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    for (const body of [
      { content: '   ' },
      { content: 'x'.repeat(2001) },
      { content: 'ok', authorUserId: owner.id },
      { content: 'ok', parentCommentId: 'nope' },
    ]) {
      await expectError(
        await as(owner).post(`/posts/${post.id}/comments`, body),
        400,
        'VALIDATION_FAILED',
      );
    }
    const long = await scene.comment(owner, post.id, 'x'.repeat(2000));
    expect(long.content).toHaveLength(2000);
  });

  it('keeps strangers, former members, and guessed IDs out with one answer', async () => {
    const { owner, member, stranger, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id);
    await ok(await as(member).delete(`/boxes/${box.id}/members/me`));
    for (const outsider of [stranger, member]) {
      for (const postId of [post.id, randomUUID()]) {
        await expectError(
          await as(outsider).post(`/posts/${postId}/comments`, {
            content: 'hi',
          }),
          404,
          'POST_NOT_FOUND',
        );
        await expectError(
          await as(outsider).get(`/posts/${postId}/comments`),
          404,
          'POST_NOT_FOUND',
        );
      }
      for (const commentId of [said.id, randomUUID()]) {
        for (const response of [
          await as(outsider).get(`/comments/${commentId}`),
          await as(outsider).get(`/comments/${commentId}/replies`),
          await as(outsider).patch(`/comments/${commentId}`, { content: 'x' }),
          await as(outsider).delete(`/comments/${commentId}`),
        ]) {
          await expectError(response, 404, 'COMMENT_NOT_FOUND');
        }
      }
    }
    await expectError(
      await as(owner).get('/comments/not-a-uuid'),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('turns suspended people away before any lookup', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const suspended = await app.createUser({
      username: `sus_${randomUUID().slice(0, 8)}`,
      status: 'suspended',
    });
    await expectError(
      await as(suspended).post(`/posts/${post.id}/comments`, { content: 'x' }),
      403,
      'ACCOUNT_BLOCKED',
    );
  });

  it('treats a deleted post as gone', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(member, box.id);
    const said = await scene.comment(owner, post.id);
    await ok(await as(member).delete(`/posts/${post.id}`));
    await expectError(
      await as(owner).post(`/posts/${post.id}/comments`, { content: 'late' }),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(owner).get(`/posts/${post.id}/comments`),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(owner).get(`/comments/${said.id}`),
      404,
      'COMMENT_NOT_FOUND',
    );
  });

  it('is read-only in an archived Box', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const mine = await scene.comment(member, post.id);
    const theirs = await scene.comment(owner, post.id);
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    for (const response of [
      await as(member).post(`/posts/${post.id}/comments`, { content: 'x' }),
      await as(member).patch(`/comments/${mine.id}`, { content: 'y' }),
      await as(member).delete(`/comments/${mine.id}`),
      await as(member).patch(`/comments/${theirs.id}`, { content: 'y' }),
      await as(member).delete(`/comments/${theirs.id}`),
    ]) {
      await expectError(response, 409, 'BOX_ARCHIVED');
    }
    const page = await scene.threads(member, post.id);
    expect(page.items).toHaveLength(2);
    const detail = commentDetailSchema.parse(
      await json(await as(member).get(`/comments/${mine.id}`)),
    );
    expect(detail.comment.canEdit).toBe(false);
    expect((await scene.postView(member, post.id)).interactions).toMatchObject({
      canInteract: false,
      commentCount: 2,
    });
  });
});

describe('replies', () => {
  it('attaches a reply to a reply to the root and records whom it answers', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(owner, post.id, 'root');
    const first = await scene.comment(admin, post.id, 'first', root.id);
    const second = await scene.comment(member, post.id, 'second', first.id);
    expect(first.parentCommentId).toBe(root.id);
    expect(second.parentCommentId).toBe(root.id);
    expect(await commentRow(first.id)).toMatchObject({
      replyToUserId: owner.id,
      depth: 1,
    });
    expect(await commentRow(second.id)).toMatchObject({
      replyToUserId: admin.id,
      depth: 1,
    });
    const detail = commentDetailSchema.parse(
      await json(await as(owner).get(`/comments/${second.id}`)),
    );
    expect(detail.rootId).toBe(root.id);
    const rootDetail = commentDetailSchema.parse(
      await json(await as(owner).get(`/comments/${root.id}`)),
    );
    expect(rootDetail).toMatchObject({
      rootId: root.id,
      comment: { replyCount: 2 },
    });
  });

  it('refuses parents that are elsewhere or deleted', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const other = await scene.say(owner, box.id, 'other');
    const foreign = await scene.comment(owner, other.id);
    const root = await scene.comment(owner, post.id);
    const doomed = await scene.comment(member, post.id, 'doomed', root.id);
    await ok(await as(member).delete(`/comments/${doomed.id}`));
    for (const parentCommentId of [foreign.id, doomed.id, randomUUID()]) {
      await expectError(
        await as(owner).post(`/posts/${post.id}/comments`, {
          content: 'reply',
          parentCommentId,
        }),
        404,
        'COMMENT_NOT_FOUND',
      );
    }
  });

  it('refuses a reply to a tombstone but keeps its thread open through live replies', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(owner, post.id);
    const reply = await scene.comment(member, post.id, 'reply', root.id);
    await ok(await as(owner).delete(`/comments/${root.id}`));
    await expectError(
      await as(member).post(`/posts/${post.id}/comments`, {
        content: 'to the tombstone',
        parentCommentId: root.id,
      }),
      404,
      'COMMENT_NOT_FOUND',
    );
    const late = await scene.comment(owner, post.id, 'still talking', reply.id);
    expect(late.parentCommentId).toBe(root.id);
  });

  it('previews the oldest three, counts them all, and pages the rest', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(owner, post.id);
    const replies: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      // Sequential, so creation order is the expected order.
      replies.push(
        (await scene.comment(member, post.id, `r${index}`, root.id)).id,
      );
    }
    const page = await scene.threads(owner, post.id);
    expect(page.items[0]?.replyCount).toBe(5);
    expect(page.items[0]?.replies.map(idOf)).toEqual(replies.slice(0, 3));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const next = commentPageSchema.parse(
        await json(
          await as(owner).get(
            `/comments/${root.id}/replies?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
          ),
        ),
      );
      seen.push(...next.items.map(idOf));
      cursor = next.nextCursor;
    } while (cursor);
    expect(seen).toEqual(replies);
    await expectError(
      await as(owner).get(`/comments/${replies[0] ?? ''}/replies`),
      404,
      'COMMENT_NOT_FOUND',
    );
  });
});

describe('editing and deleting', () => {
  it('lets only the author change a comment, even for owners and admins', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(member, post.id, 'mine');
    for (const other of [owner, admin]) {
      await expectError(
        await as(other).patch(`/comments/${said.id}`, { content: 'hijack' }),
        403,
        'COMMENT_ACCESS_DENIED',
      );
      await expectError(
        await as(other).delete(`/comments/${said.id}`),
        403,
        'COMMENT_ACCESS_DENIED',
      );
    }
    const edited = commentSchema.parse(
      await json(
        await as(member).patch(`/comments/${said.id}`, { content: ' better ' }),
      ),
    );
    expect(edited.content).toBe('better');
    expect(edited.editedAt).not.toBeNull();
    const seenByOwner = await scene.threads(owner, post.id);
    expect(seenByOwner.items[0]?.root).toMatchObject({
      kind: 'comment',
      comment: { content: 'better', canEdit: false },
    });
  });

  it('erases the text and reactions on delete and is idempotent for the author', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(member, post.id, 'secret');
    await scene.reactToComment(owner, said.id);
    await ok(await as(member).delete(`/comments/${said.id}`));
    await ok(await as(member).delete(`/comments/${said.id}`));
    const row = await commentRow(said.id);
    expect(row).toMatchObject({ status: 'deleted', content: null });
    expect(row?.deletedAt).not.toBeNull();
    expect(
      await app.database
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, said.id)),
    ).toEqual([]);
    for (const response of [
      await as(owner).delete(`/comments/${said.id}`),
      await as(member).patch(`/comments/${said.id}`, { content: 'zombie' }),
      await as(owner).get(`/comments/${said.id}`),
    ]) {
      await expectError(response, 404, 'COMMENT_NOT_FOUND');
    }
    const page = await scene.threads(owner, post.id);
    expect(JSON.stringify(page)).not.toContain('secret');
    expect(page.items).toEqual([]);
  });

  it('keeps a deleted root only while it has replies, and omits deleted replies', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(owner, post.id, 'root words');
    const reply = await scene.comment(member, post.id, 'reply', root.id);
    const gone = await scene.comment(member, post.id, 'gone', root.id);
    await ok(await as(member).delete(`/comments/${gone.id}`));
    await ok(await as(owner).delete(`/comments/${root.id}`));
    let page = await scene.threads(member, post.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      root: {
        kind: 'deleted',
        deleted: { id: root.id, postId: post.id, parentCommentId: null },
      },
      replyCount: 1,
    });
    expect(page.items[0]?.replies.map(idOf)).toEqual([reply.id]);
    expect(JSON.stringify(page)).not.toContain('root words');
    expect(JSON.stringify(page.items[0]?.root)).not.toContain(owner.id);
    expect(
      (await scene.postView(owner, post.id)).interactions.commentCount,
    ).toBe(1);

    await ok(await as(member).delete(`/comments/${reply.id}`));
    page = await scene.threads(member, post.id);
    expect(page.items).toEqual([]);
    expect(
      (await scene.postView(owner, post.id)).interactions.commentCount,
    ).toBe(0);
  });

  it('decides a simultaneous edit and delete one after the other', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(owner, post.id, 'race');
    const [edit, remove] = await Promise.all([
      as(owner).patch(`/comments/${said.id}`, { content: 'edited' }),
      as(owner).delete(`/comments/${said.id}`),
    ]);
    expect(remove.status).toBe(204);
    expect([200, 404]).toContain(edit.status);
    expect(await commentRow(said.id)).toMatchObject({
      status: 'deleted',
      content: null,
    });
  });

  it('never lets a comment land in a Box archived first', async () => {
    const { owner, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const [archive, create] = await Promise.all([
      as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
      as(owner).post(`/posts/${post.id}/comments`, { content: 'racing' }),
    ]);
    expect(archive.status).toBe(200);
    expect([201, 409]).toContain(create.status);
    const rows = await app.database
      .select()
      .from(comments)
      .where(eq(comments.postId, post.id));
    expect(rows).toHaveLength(create.status === 201 ? 1 : 0);
  });
});

describe('paging threads', () => {
  it('pages roots newest first without repeats, even with identical timestamps', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const at = new Date('2026-10-01T12:00:00.123456Z');
    const ids = Array.from({ length: 5 }, () => randomUUID());
    await app.database.insert(comments).values(
      ids.map((id) => ({
        id,
        postId: post.id,
        authorUserId: member.id,
        content: 'same moment',
        createdAt: at,
      })),
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await scene.threads(
        owner,
        post.id,
        `?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...page.items.map((thread) => idOf(thread.root)));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...ids].sort().reverse());
  });
});

describe('interaction summaries', () => {
  it('count active comments and visible reactions on posts and comments', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const root = await scene.comment(member, post.id);
    await scene.comment(admin, post.id, 'reply', root.id);
    const gone = await scene.comment(admin, post.id, 'gone');
    await ok(await as(admin).delete(`/comments/${gone.id}`));
    await scene.reactToPost(admin, post.id, '😂');
    await scene.reactToPost(member, post.id, '😂');
    await scene.reactToPost(owner, post.id, '❤️');
    await scene.reactToComment(owner, root.id, '🔥');
    const summary = (await scene.postView(owner, post.id)).interactions;
    expect(summary).toMatchObject({
      commentCount: 2,
      reactionCount: 3,
      reactions: [
        { kind: '😂', count: 2 },
        { kind: '❤️', count: 1 },
      ],
      realCount: 0,
      viewerReaction: { kind: '❤️' },
    });
    const threads = await scene.threads(owner, post.id);
    expect(threads.items[0]?.root).toMatchObject({
      kind: 'comment',
      comment: {
        interactions: {
          reactions: [{ kind: '🔥', count: 1 }],
          reactionCount: 1,
          viewerReaction: { kind: '🔥' },
        },
      },
    });
  });

  it('preview the latest camera reactions with signed thumbnails', async () => {
    const { owner, admin, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    await scene.cameraReaction(member, box.id, post.id);
    const mine = await scene.cameraReaction(admin, box.id, post.id);
    const summary = (await scene.postView(admin, post.id)).interactions;
    expect(summary).toMatchObject({
      realCount: 2,
      reactionCount: 2,
      reactions: [],
      viewerReaction: { kind: 'real', mediaAssetId: mine },
    });
    expect(summary.realPreview.map((entry) => entry.user.id)).toEqual([
      admin.id,
      member.id,
    ]);
    expect(summary.realPreview[0]?.thumbnailUrl).toContain(
      encodeURIComponent(`media/${mine}/thumbnail.webp`),
    );
  });
});

describe('query budget', () => {
  it('serves a feed page with interactions in a constant number of queries', async () => {
    const { owner, member, box } = await scene.room();
    for (let index = 0; index < 20; index += 1) {
      // Sequential: a stable feed order is not what is measured here.
      const post = await scene.say(owner, box.id, `p${index}`);
      await scene.comment(member, post.id);
      await scene.reactToPost(member, post.id, '🎉');
      await scene.cameraReaction(owner, box.id, post.id);
    }
    const feed = (limit: number) => async () => {
      const page = feedPageSchema.parse(
        await json(await as(member).get(`/me/feed?limit=${limit}`)),
      );
      expect(page.items).toHaveLength(limit);
    };
    const small = await countQueries(feed(2));
    const large = await countQueries(feed(20));
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(12);
  });

  it('serves a comments page in a constant number of queries', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    for (let index = 0; index < 10; index += 1) {
      // Sequential, as above.
      const root = await scene.comment(owner, post.id, `c${index}`);
      await scene.comment(member, post.id, 'reply', root.id);
      await scene.reactToComment(member, root.id);
    }
    const page = (limit: number) => () =>
      scene.threads(owner, post.id, `?limit=${limit}`);
    const small = await countQueries(page(1));
    const large = await countQueries(page(10));
    expect(large).toBe(small);
  });
});

describe('deleting a post erases its interactions', () => {
  it('tombstones comments, deletes reactions and notifications, and retires camera images', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const said = await scene.comment(member, post.id, 'words');
    await scene.comment(owner, post.id, 'reply', said.id);
    await scene.reactToComment(owner, said.id);
    await scene.reactToPost(member, post.id);
    const image = await scene.cameraReaction(owner, box.id, post.id);
    await app.database.insert(notifications).values({
      recipientUserId: member.id,
      actorUserId: owner.id,
      type: 'comment.reply',
      postId: post.id,
      commentId: said.id,
      dedupeKey: `comment.reply:${randomUUID()}`,
    });
    await ok(await as(owner).delete(`/posts/${post.id}`));

    const left = await app.database
      .select()
      .from(comments)
      .where(eq(comments.postId, post.id));
    expect(left).toHaveLength(2);
    expect(
      left.every((row) => row.status === 'deleted' && row.content === null),
    ).toBe(true);
    for (const table of [postReactions, notifications] as const) {
      expect(
        await app.database
          .select({ one: sql`1` })
          .from(table)
          .where(eq(table.postId, post.id)),
      ).toEqual([]);
    }
    expect(
      await app.database
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, said.id)),
    ).toEqual([]);
    const [asset] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, image));
    expect(asset?.status).toBe('deleted');
    const queued = await app.database
      .select({ payload: mediaJobOutbox.payload })
      .from(mediaJobOutbox)
      .where(
        and(
          eq(mediaJobOutbox.jobType, 'media.delete'),
          sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${`media/${image}/thumbnail.webp`}`,
        ),
      );
    expect(queued).toHaveLength(1);
  });

  it('retires camera images when the whole Box is deleted', async () => {
    const { owner, member, box } = await scene.room();
    const post = await scene.say(owner, box.id);
    const image = await scene.cameraReaction(member, box.id, post.id);
    await ok(
      await as(owner).delete(
        `/boxes/${box.id}?confirmName=${encodeURIComponent(box.name)}`,
      ),
    );
    const [asset] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, [image]));
    expect(asset?.status).toBe('deleted');
    expect(
      await app.database
        .select()
        .from(postReactions)
        .where(eq(postReactions.postId, post.id)),
    ).toEqual([]);
  });
});
