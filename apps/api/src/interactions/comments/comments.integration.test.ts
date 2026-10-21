import { comments } from '@paldora/database';
import {
  commentDetailSchema,
  commentPageSchema,
  type CommentItemView,
} from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../../test-support/http.js';
import { scenes } from '../../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../../test-support/test-app.js';

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
