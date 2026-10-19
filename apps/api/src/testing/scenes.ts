import { mediaAssets } from '@paldora/database';
import {
  boxInvitationSchema,
  boxSchema,
  commentInteractionSummarySchema,
  commentSchema,
  commentThreadPageSchema,
  postInteractionSummarySchema,
  postSchema,
  type CommentView,
  type PostView,
} from '@paldora/validation';
import { randomUUID } from 'node:crypto';
import { client, json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

/**
 * Shared setup for interaction tests: Boxes with people in them, posts, and
 * comments, and reactions made through the real API. Only a processed camera
 * capture is written straight to the database, standing in for the worker.
 */
export function scenes(app: TestApp) {
  const as = (user: TestUser) => client(app, user);

  async function newBox(owner: TestUser, name = 'Crew') {
    return boxSchema.parse(
      await json(await as(owner).post('/boxes', { name }), 201),
    );
  }

  async function join(owner: TestUser, boxId: string, guest: TestUser) {
    const invitation = boxInvitationSchema.parse(
      await json(
        await as(owner).post(`/boxes/${boxId}/invitations`, {
          username: guest.username,
        }),
        201,
      ),
    );
    await json(
      await as(guest).post(`/box-invitations/${invitation.id}/accept`),
    );
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
    const id = randomUUID();
    await app.database.insert(mediaAssets).values({
      id,
      ownerUserId: user.id,
      boxId,
      purpose: 'reaction_image',
      status: 'ready',
      contentType: 'image/jpeg',
      contentLength: 1_000,
      uploadExpiresAt: new Date(),
      uploadObjectKey: `uploads/${id}`,
      masterObjectKey: `media/${id}/master.webp`,
      displayObjectKey: `media/${id}/display.webp`,
      thumbnailObjectKey: `media/${id}/thumbnail.webp`,
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
