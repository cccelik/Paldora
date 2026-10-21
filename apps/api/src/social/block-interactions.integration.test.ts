import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, ok } from '../test-support/http.js';
import { notificationTools } from '../test-support/notifications.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

/** ADR 013 block-direction matrix for Phase 5, including restoration and races. */
let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);

const block: ReturnType<typeof scenes>['block'] = (...args) =>
  scenes(app).block(...args);

describe('comments and reactions in a shared Box (Phase 5)', () => {
  const setup = async () => {
    const scene = scenes(app);
    const {
      owner: viewer,
      member: other,
      admin: third,
      box,
    } = await scene.room();
    const post = await scene.say(third, box.id, 'neutral post');
    const theirRoot = await scene.comment(other, post.id, 'secret words');
    const myRoot = await scene.comment(viewer, post.id, 'my words');
    const theirReply = await scene.comment(
      other,
      post.id,
      'secret reply',
      myRoot.id,
    );
    await scene.reactToPost(other, post.id, '😂');
    await scene.reactToPost(viewer, post.id, '❤️');
    await scene.reactToComment(other, myRoot.id, '🔥');
    const second = await scene.say(third, box.id, 'second post');
    await scene.cameraReaction(other, box.id, second.id);
    const theirPost = await scene.say(other, box.id, 'their post');
    return {
      scene,
      viewer,
      other,
      third,
      post,
      second,
      theirPost,
      theirRoot,
      myRoot,
      theirReply,
    };
  };

  it.each([
    ['the viewer blocked the commenter', 'viewer'],
    ['the commenter blocked the viewer', 'other'],
  ])('%s', async (_name, direction) => {
    const s = await setup();
    const [from, target] =
      direction === 'viewer' ? [s.viewer, s.other] : [s.other, s.viewer];
    await block(from, target);

    const page = await s.scene.threads(s.viewer, s.post.id);
    const byRoot = new Map(
      page.items.map((thread) => [
        thread.root.kind === 'hidden'
          ? thread.root.hidden.id
          : thread.root.kind === 'comment'
            ? thread.root.comment.id
            : thread.root.deleted.id,
        thread,
      ]),
    );
    // Their thread is one neutral placeholder: an ID and a time, no replies.
    expect(byRoot.get(s.theirRoot.id)).toEqual({
      root: {
        kind: 'hidden',
        hidden: { id: s.theirRoot.id, createdAt: s.theirRoot.createdAt },
      },
      replies: [],
      replyCount: 0,
    });
    // Their reply in my thread is a placeholder; their reaction is not counted.
    const mine = byRoot.get(s.myRoot.id);
    expect(mine?.replies).toEqual([
      {
        kind: 'hidden',
        hidden: { id: s.theirReply.id, createdAt: s.theirReply.createdAt },
      },
    ]);
    expect(mine?.root).toMatchObject({
      kind: 'comment',
      comment: { interactions: { reactionCount: 0, reactions: [] } },
    });
    const leaks = JSON.stringify(page);
    for (const leak of ['secret', s.other.id, s.other.username]) {
      expect(leaks).not.toContain(leak);
    }

    // Counts are viewer-relative, so a number never reveals blocked activity.
    expect(
      (await s.scene.postView(s.viewer, s.post.id)).interactions,
    ).toMatchObject({
      commentCount: 1,
      reactionCount: 1,
      reactions: [{ kind: '❤️', count: 1 }],
    });
    expect(
      (await s.scene.postView(s.viewer, s.second.id)).interactions,
    ).toMatchObject({ realCount: 0, realPreview: [], reactionCount: 0 });
    // Someone outside the block sees everything.
    expect(
      (await s.scene.postView(s.third, s.post.id)).interactions,
    ).toMatchObject({ commentCount: 3, reactionCount: 2 });

    // Hidden comments cannot be reached directly or replied to.
    for (const response of [
      await as(s.viewer).get(`/comments/${s.theirRoot.id}`),
      await as(s.viewer).get(`/comments/${s.theirRoot.id}/replies`),
      await as(s.viewer).get(`/comments/${s.theirReply.id}`),
      await as(s.viewer).post(`/posts/${s.post.id}/comments`, {
        content: 'reply',
        parentCommentId: s.theirReply.id,
      }),
    ]) {
      await expectError(response, 404, 'COMMENT_NOT_FOUND');
    }
    // Their post is gone for the viewer, comments and all.
    await expectError(
      await as(s.viewer).post(`/posts/${s.theirPost.id}/comments`, {
        content: 'hi',
      }),
      404,
      'POST_NOT_FOUND',
    );
    await expectError(
      await as(s.viewer).get(`/posts/${s.theirPost.id}/comments`),
      404,
      'POST_NOT_FOUND',
    );
    // The other side sees the viewer the same way.
    const theirView = await s.scene.threads(s.other, s.post.id);
    expect(JSON.stringify(theirView)).not.toContain('my words');

    // Unblocking restores everything; blocking again hides it again.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    const restored = await s.scene.threads(s.viewer, s.post.id);
    expect(JSON.stringify(restored)).toContain('secret words');
    expect(
      (await s.scene.postView(s.viewer, s.post.id)).interactions.commentCount,
    ).toBe(3);
    await block(from, target);
    expect(
      JSON.stringify(await s.scene.threads(s.viewer, s.post.id)),
    ).not.toContain('secret');
  });

  it.each(Array.from({ length: 4 }, (_, index) => index))(
    'never shows a comment racing a block (round %i)',
    async () => {
      const scene = scenes(app);
      const { owner: viewer, member: other, box } = await scene.room();
      const post = await scene.say(viewer, box.id);
      const [created, blocked] = await Promise.all([
        as(other).post(`/posts/${post.id}/comments`, { content: 'racing' }),
        as(viewer).post('/blocks', { username: other.username }),
      ]);
      expect(blocked.status).toBe(201);
      expect([201, 404]).toContain(created.status);
      const page = await scene.threads(viewer, post.id);
      expect(JSON.stringify(page)).not.toContain('racing');
      expect(
        (await scene.postView(viewer, post.id)).interactions.commentCount,
      ).toBe(0);
    },
  );
});

describe('notifications across a block (Phase 5)', () => {
  it.each([
    ['the recipient blocked the actor', 'recipient'],
    ['the actor blocked the recipient', 'actor'],
  ])('%s', async (_name, direction) => {
    const scene = scenes(app);
    const { deliver, unread, visibleIds } = notificationTools(app);
    const {
      owner: recipient,
      member: actor,
      admin: bystander,
      box,
    } = await scene.room();
    const post = await scene.say(recipient, box.id);
    const comment = await scene.comment(actor, post.id, 'hello');
    await scene.reactToPost(actor, post.id, '👍');
    await scene.reactToPost(bystander, post.id, '❤️');
    const fromActor = [
      await deliver({
        recipient,
        actor,
        type: 'post.comment',
        postId: post.id,
        commentId: comment.id,
      }),
      await deliver({
        recipient,
        actor,
        type: 'post.reaction',
        postId: post.id,
      }),
    ];
    const fromBystander = await deliver({
      recipient,
      actor: bystander,
      type: 'post.reaction',
      postId: post.id,
    });
    const [from, target] =
      direction === 'recipient' ? [recipient, actor] : [actor, recipient];

    await block(from, target);
    // Created before the block, hidden after it: rechecked at every read.
    expect(await visibleIds(recipient)).toEqual([fromBystander]);
    expect(await unread(recipient)).toEqual({ count: 1, capped: false });
    for (const id of fromActor) {
      // Sequential for clarity: one 404 per hidden notification.

      await expectError(
        await as(recipient).post(`/me/notifications/${id}/read`),
        404,
        'NOTIFICATION_NOT_FOUND',
      );
    }

    // Unblocking restores them (still unread); blocking again hides them.
    await ok(await as(from).delete(`/blocks/${target.id}`));
    expect((await visibleIds(recipient)).sort()).toEqual(
      [...fromActor, fromBystander].sort(),
    );
    expect(await unread(recipient)).toEqual({ count: 3, capped: false });
    await block(from, target);
    expect(await visibleIds(recipient)).toEqual([fromBystander]);
  });
});
