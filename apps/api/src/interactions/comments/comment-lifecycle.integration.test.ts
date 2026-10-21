import { commentReactions, comments } from '@paldora/database';
import { commentSchema, type CommentItemView } from '@paldora/validation';
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
