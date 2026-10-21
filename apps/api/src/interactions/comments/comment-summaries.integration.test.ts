import {
  commentReactions,
  comments,
  mediaAssets,
  mediaJobOutbox,
  notifications,
  postReactions,
} from '@paldora/database';
import { feedPageSchema } from '@paldora/validation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json, ok } from '../../test-support/http.js';
import { countQueries } from '../../test-support/query-count.js';
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
