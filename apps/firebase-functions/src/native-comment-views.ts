import {
  NativePostError,
  type NativeBoxPosts,
  type NativeComment,
  type NativeCommentItem,
  type NativeCommentThread,
} from '@paldora/firebase-trusted';
import type { native } from '@paldora/validation';

/** Wire form of a trusted comment: no interaction summary, as `listBoxComments`. */
function commentView(comment: NativeComment): native.NativeComment {
  return {
    id: comment.id,
    postId: comment.postId,
    authorUid: comment.authorUid,
    parentId: comment.parentId,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export function commentItemView(
  item: NativeCommentItem,
): native.NativeCommentItem {
  return item.kind === 'comment'
    ? { kind: 'comment', comment: commentView(item.comment) }
    : { kind: item.kind, id: item.id, createdAt: item.createdAt };
}

export function commentThreadView(
  thread: NativeCommentThread,
): native.NativeCommentThread {
  return {
    root: commentItemView(thread.root),
    rootId: thread.rootId,
    replies: thread.replies.map(commentItemView),
    replyCount: thread.replyCount,
  };
}

/**
 * The thread containing `commentId`, as the web adapter's
 * `pinnedCommentThread`: the linked comment must be visible to the viewer. A
 * deleted or hidden root becomes a `deleted` placeholder, and a linked reply
 * missing from the three-reply preview is appended to it. Any unavailable
 * state throws `UNAVAILABLE`, the same for absence and denial.
 */
export async function pinnedCommentThread(
  posts: NativeBoxPosts,
  boxId: string,
  postId: string,
  commentId: string,
  viewerUid: string,
): Promise<native.NativeCommentThread> {
  const detail = await posts.commentDetail(boxId, postId, commentId, viewerUid);
  const { rootId } = detail;
  const root =
    detail.comment.parentId === null
      ? detail.comment
      : await posts
          .commentDetail(boxId, postId, rootId, viewerUid)
          .then((result) => result.comment)
          .catch((error: unknown) => {
            if (
              error instanceof NativePostError &&
              error.code === 'UNAVAILABLE'
            )
              return null;
            throw error;
          });
  const preview = root
    ? (
        await posts.listCommentReplies(
          boxId,
          postId,
          rootId,
          viewerUid,
          undefined,
          3,
        )
      ).items
    : [];
  if (
    detail.comment.parentId !== null &&
    !preview.some(
      (item) => item.kind === 'comment' && item.comment.id === commentId,
    )
  )
    preview.push({ kind: 'comment', comment: detail.comment });
  return commentThreadView({
    root: root
      ? { kind: 'comment', comment: root }
      : { kind: 'deleted', id: rootId, createdAt: detail.comment.createdAt },
    rootId,
    replies: preview,
    replyCount: root
      ? await posts.countCommentReplies(boxId, postId, rootId, viewerUid)
      : preview.length,
  });
}
