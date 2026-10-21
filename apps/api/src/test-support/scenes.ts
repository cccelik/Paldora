import { relationshipScenes } from './relationships.js';
import type { mediaAssets } from '@paldora/database';
import { readyMediaAsset } from '@paldora/database/testing';
import {
  commentInteractionSummarySchema,
  commentSchema,
  commentThreadPageSchema,
  postInteractionSummarySchema,
  postSchema,
  type CommentView,
  type PostView,
} from '@paldora/validation';
import { json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

/**
 * Shared setup for interaction tests: Boxes with people in them, posts, and
 * comments, and reactions made through the real API. Only a processed camera
 * capture is written straight to the database, standing in for the worker.
 */
export function scenes(app: TestApp) {
  const { as, newBox, join, invite, befriend, block, sharedBox } =
    relationshipScenes(app);

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

  async function say(
    user: TestUser,
    boxId: string,
    content = 'a post',
  ): Promise<PostView> {
    return postSchema.parse(
      await json(
        await as(user).post(`/boxes/${boxId}/posts`, { content }),
        201,
      ),
    );
  }

  async function comment(
    user: TestUser,
    postId: string,
    content = 'a comment',
    parentCommentId?: string,
  ): Promise<CommentView> {
    return commentSchema.parse(
      await json(
        await as(user).post(`/posts/${postId}/comments`, {
          content,
          ...(parentCommentId ? { parentCommentId } : {}),
        }),
        201,
      ),
    );
  }

  async function threads(user: TestUser, postId: string, query = '') {
    return commentThreadPageSchema.parse(
      await json(await as(user).get(`/posts/${postId}/comments${query}`)),
    );
  }

  async function postView(user: TestUser, postId: string) {
    return postSchema.parse(await json(await as(user).get(`/posts/${postId}`)));
  }

  async function reactToPost(user: TestUser, postId: string, kind = '👍') {
    return postInteractionSummarySchema.parse(
      await json(await as(user).put(`/posts/${postId}/reaction`, { kind })),
    );
  }

  async function reactToComment(
    user: TestUser,
    commentId: string,
    kind = '👍',
  ) {
    return commentInteractionSummarySchema.parse(
      await json(
        await as(user).put(`/comments/${commentId}/reaction`, { kind }),
      ),
    );
  }

  /**
   * A camera capture the worker has finished processing, as if uploaded by
   * `user` for `boxId`. Its derivative keys exist only in the database.
   */
  async function cameraImage(
    user: TestUser,
    boxId: string,
    overrides: Partial<typeof mediaAssets.$inferInsert> = {},
  ) {
    const { id } = await readyMediaAsset(app.database, {
      ownerId: user.id,
      purpose: 'reaction_image',
      boxId,
      width: 1024,
      height: 768,
      ...overrides,
    });
    return id;
  }

  /** A processed camera capture, set as `user`'s reaction through the API. */
  async function cameraReaction(user: TestUser, boxId: string, postId: string) {
    const id = await cameraImage(user, boxId);
    await json(
      await as(user).put(`/posts/${postId}/reaction`, {
        kind: 'real',
        mediaAssetId: id,
      }),
    );
    return id;
  }

  return {
    as,
    invite,
    befriend,
    block,
    sharedBox,
    newBox,
    join,
    room,
    say,
    comment,
    threads,
    postView,
    reactToPost,
    reactToComment,
    cameraImage,
    cameraReaction,
  };
}
