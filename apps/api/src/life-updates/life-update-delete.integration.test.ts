import {
  commentReactions,
  comments,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  mediaJobOutbox,
  notifications,
  postReactions,
  posts,
} from '@paldora/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../testing/http.js';
import { lifeUpdateTools } from '../testing/life-updates.js';
import { notificationTools } from '../testing/notifications.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

let app: TestApp;
let scene: ReturnType<typeof scenes>;
let tools: ReturnType<typeof lifeUpdateTools>;
let inbox: ReturnType<typeof notificationTools>;
beforeAll(async () => {
  app = await createTestApp();
  scene = scenes(app);
  tools = lifeUpdateTools(app);
  inbox = notificationTools(app);
});
afterAll(() => app.close());

const remove = (user: TestUser, lifeUpdateId: string) =>
  scene.as(user).delete(`/life-updates/${lifeUpdateId}`);

/** An author sharing to two Boxes, a member of each, and a stranger. */
async function shared() {
  const [author, inAlpha, inBravo, stranger] = (await Promise.all(
    ['author', 'alpha', 'bravo', 'stranger'].map((name) => app.person(name)),
  )) as [TestUser, TestUser, TestUser, TestUser];
  const alpha = await scene.newBox(author, 'Alpha');
  const bravo = await scene.newBox(author, 'Bravo');
  await scene.join(author, alpha.id, inAlpha);
  await scene.join(author, bravo.id, inBravo);
  const first = await tools.photo(author);
  const second = await tools.photo(author);
  const published = await tools.shareTo(author, [alpha.id, bravo.id], {
    mediaAssetIds: [first.id, second.id],
  });
  const postIn = (boxId: string) =>
    published.contexts.find((context) => context.box.id === boxId)?.postId ??
    '';
  return {
    author,
    inAlpha,
    inBravo,
    stranger,
    alpha,
    bravo,
    published,
    photos: [first, second],
    alphaPost: postIn(alpha.id),
    bravoPost: postIn(bravo.id),
  };
}

const countWhere = async (
  table: typeof comments | typeof postReactions | typeof notifications,
  postIds: string[],
) => {
  const column =
    table === comments
      ? comments.postId
      : table === postReactions
        ? postReactions.postId
        : notifications.postId;
  const condition =
    table === comments
      ? and(inArray(column, postIds), eq(comments.status, 'active'))
      : inArray(column, postIds);
  const [row] = await app.database
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(condition);
  return row?.count ?? 0;
};

describe('who may delete', () => {
  it('is the author alone, with non-leaking answers for everyone else', async () => {
    const { author, inAlpha, stranger, published } = await shared();
    await expectError(
      await remove(inAlpha, published.id),
      403,
      'LIFE_UPDATE_ACCESS_DENIED',
    );
    for (const [user, id] of [
      [stranger, published.id],
      [author, randomUUID()],
    ] as const) {
      await expectError(await remove(user, id), 404, 'LIFE_UPDATE_NOT_FOUND');
    }
    await expectError(
      await scene.as(author).delete('/life-updates/nope'),
      400,
      'VALIDATION_FAILED',
    );
    await json(
      await scene.as(author).post('/blocks', { username: inAlpha.username }),
      201,
    );
    await expectError(
      await remove(inAlpha, published.id),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });

  it('stops a former member at not found, and allows the author in an archived Box', async () => {
    const { author, inAlpha, alpha, bravo, published } = await shared();
    await ok(await scene.as(inAlpha).delete(`/boxes/${alpha.id}/members/me`));
    await expectError(
      await remove(inAlpha, published.id),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
    for (const box of [alpha, bravo]) {
      await json(
        await scene
          .as(author)
          .patch(`/boxes/${box.id}`, { status: 'archived' }),
      );
    }
    await ok(await remove(author, published.id));
  });
});

describe('deleting', () => {
  it('erases every delivery’s interactions, notifications, and photos in one go', async () => {
    const {
      author,
      inAlpha,
      inBravo,
      alpha,
      published,
      photos,
      alphaPost,
      bravoPost,
    } = await shared();
    const remark = await scene.comment(inAlpha, alphaPost, 'lovely');
    await scene.comment(inBravo, bravoPost, 'hello from Bravo');
    await scene.reactToPost(inBravo, bravoPost, '🔥');
    await scene.reactToComment(author, remark.id, '❤️');
    const camera = await scene.cameraReaction(inAlpha, alpha.id, alphaPost);
    await inbox.deliver({
      recipient: author,
      actor: inAlpha,
      type: 'post.comment',
      postId: alphaPost,
      commentId: remark.id,
    });
    await inbox.deliver({
      recipient: author,
      actor: inBravo,
      type: 'post.reaction',
      postId: bravoPost,
    });
    expect(await inbox.visibleIds(author)).toHaveLength(2);

    await ok(await remove(author, published.id));

    const backing = [alphaPost, bravoPost];
    expect(await countWhere(comments, backing)).toBe(0);
    expect(await countWhere(postReactions, backing)).toBe(0);
    expect(await countWhere(notifications, backing)).toBe(0);
    const [commentReactionCount] = await app.database
      .select({ count: sql<number>`count(*)::int` })
      .from(commentReactions)
      .where(eq(commentReactions.commentId, remark.id));
    expect(commentReactionCount?.count).toBe(0);
    const tombstones = await app.database
      .select({ status: posts.status, content: posts.content })
      .from(posts)
      .where(inArray(posts.id, backing));
    expect(tombstones).toEqual([
      { status: 'deleted', content: null },
      { status: 'deleted', content: null },
    ]);
    const [update] = await app.database
      .select()
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, published.id));
    expect(update).toMatchObject({ status: 'deleted', sections: {} });
    expect(
      await app.database
        .select()
        .from(lifeUpdateMedia)
        .where(eq(lifeUpdateMedia.lifeUpdateId, published.id)),
    ).toEqual([]);
    // Every photo (and the camera capture) is retired once, with all of its
    // objects queued for deletion: nothing stays in storage.
    for (const id of [...photos.map((photo) => photo.id), camera]) {
      const [asset] = await app.database
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, id));
      expect(asset?.status).toBe('deleted');
      const jobs = await app.database
        .select({ payload: mediaJobOutbox.payload })
        .from(mediaJobOutbox)
        .where(
          sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${asset?.masterObjectKey ?? ''}`,
        );
      expect(jobs).toHaveLength(1);
      expect([...(jobs[0]?.payload.objectKeys ?? [])].sort()).toEqual(
        [
          asset?.uploadObjectKey,
          asset?.masterObjectKey,
          asset?.displayObjectKey,
          asset?.thumbnailObjectKey,
        ].sort(),
      );
    }
    for (const viewer of [author, inAlpha, inBravo]) {
      await expectError(
        await scene.as(viewer).get(`/life-updates/${published.id}`),
        404,
        'LIFE_UPDATE_NOT_FOUND',
      );
    }
    await expectError(
      await scene.as(inAlpha).get(`/posts/${alphaPost}`),
      404,
      'POST_NOT_FOUND',
    );
    expect(await inbox.visibleIds(author)).toEqual([]);
    expect(
      (await tools.mine(author)).items.map((item) => item.id),
    ).not.toContain(published.id);
  });

  it('is idempotent for the author and stays not found for others', async () => {
    const { author, inAlpha, published } = await shared();
    await ok(await remove(author, published.id));
    await ok(await remove(author, published.id));
    await expectError(
      await remove(inAlpha, published.id),
      404,
      'LIFE_UPDATE_NOT_FOUND',
    );
  });

  it('deletes Only Me updates and their photos', async () => {
    const author = await app.person('private');
    const photo = await tools.photo(author);
    const kept = await tools.keepPrivate(author, { mediaAssetIds: [photo.id] });
    await ok(await remove(author, kept.id));
    const [asset] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, photo.id));
    expect(asset?.status).toBe('deleted');
  });
});

describe('races', () => {
  it('lets concurrent deletes all succeed, erasing once', async () => {
    const { author, published, photos } = await shared();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => remove(author, published.id)),
    );
    expect(responses.map((response) => response.status)).toEqual([
      204, 204, 204, 204,
    ]);
    const jobs = await app.database
      .select({ id: mediaJobOutbox.id })
      .from(mediaJobOutbox)
      .where(
        sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${photos[0]?.keys.masterObjectKey ?? ''}`,
      );
    expect(jobs).toHaveLength(1);
  });

  it('never leaves a comment or reaction on a deleted delivery', async () => {
    for (let round = 0; round < 3; round += 1) {
      // Sequential rounds, each racing a delete against interactions.
      const { author, inAlpha, inBravo, published, alphaPost, bravoPost } =
        await shared();
      const results = await Promise.all([
        scene.as(inAlpha).post(`/posts/${alphaPost}/comments`, {
          content: 'racing',
        }),
        scene.as(inBravo).put(`/posts/${bravoPost}/reaction`, { kind: '👍' }),
        remove(author, published.id),
        scene.as(inAlpha).put(`/posts/${alphaPost}/reaction`, { kind: '🔥' }),
      ]);
      expect(results[2]?.status).toBe(204);
      for (const response of [results[0], results[1], results[3]]) {
        // Either it landed before the delete (and was erased) or it found
        // the post gone.
        expect([200, 201, 404]).toContain(response?.status);
      }
      const backing = [alphaPost, bravoPost];
      expect(await countWhere(comments, backing)).toBe(0);
      expect(await countWhere(postReactions, backing)).toBe(0);
    }
  });
});
