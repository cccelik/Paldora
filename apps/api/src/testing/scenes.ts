import {
  commentReactions,
  mediaAssets,
  postReactions,
} from '@paldora/database';
import {
  boxInvitationSchema,
  boxSchema,
  commentSchema,
  commentThreadPageSchema,
  postSchema,
  type CommentView,
  type PostView,
} from '@paldora/validation';
import { randomUUID } from 'node:crypto';
import { client, json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

/**
 * Shared setup for interaction tests: Boxes with people in them, posts, and
 * comments made through the real API. Reactions are written straight to the
 * database until their setters exist, so read paths can be tested first.
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
    await app.database
      .insert(postReactions)
      .values({ postId, userId: user.id, kind });
  }

  async function reactToComment(
    user: TestUser,
    commentId: string,
    kind = '👍',
  ) {
    await app.database
      .insert(commentReactions)
      .values({ commentId, userId: user.id, kind });
  }

  /** A processed camera capture and the reaction that uses it. */
  async function cameraReaction(user: TestUser, boxId: string, postId: string) {
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
    });
    await app.database
      .insert(postReactions)
      .values({ postId, userId: user.id, kind: 'real', mediaAssetId: id });
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
    cameraReaction,
  };
}
