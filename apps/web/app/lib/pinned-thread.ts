import 'server-only';

import { ApiClientError, type PaldoraApiClient } from '@paldora/api-client';
import { uuidSchema, type CommentItemView } from '@paldora/validation';
import type { ThreadData } from '../components/comment-thread-view';
import { cursorParam, orNotFound } from './session';

/** Absent and not-yours look the same; only those become "no pin". */
async function visibleOrNull<Value>(work: Promise<Value>) {
  try {
    return await work;
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      ['COMMENT_NOT_FOUND', 'VALIDATION_FAILED'].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * The thread a deep link points into: its root (or a tombstone when the
 * root is gone) and enough replies to include the linked one.
 */
export async function pinnedThread(
  api: PaldoraApiClient,
  postId: string,
  commentId: string,
): Promise<ThreadData | null> {
  const detail = await visibleOrNull(api.comment(commentId));
  if (!detail || detail.comment.postId !== postId) return null;
  const { rootId, comment } = detail;
  const isRoot = comment.parentCommentId === null;
  const [root, replies] = await Promise.all([
    isRoot ? detail : visibleOrNull(api.comment(rootId)),
    api.commentReplies(rootId, { limit: 50 }),
  ]);
  const items: CommentItemView[] = [...replies.items];
  if (
    !isRoot &&
    !items.some(
      (item) => item.kind === 'comment' && item.comment.id === comment.id,
    )
  ) {
    items.push({ kind: 'comment', comment });
  }
  return {
    root: root ? { kind: 'comment', comment: root.comment } : null,
    rootId,
    replies: items,
    replyCount: root?.comment.replyCount ?? items.length,
  };
}

/**
 * A post's comment page plus the thread a `?comment=` link pins, for any
 * page that shows one post's conversation (a post, a Life Update's Box).
 */
export async function conversationFor(
  api: PaldoraApiClient,
  postId: string,
  query: {
    comment?: string | string[] | undefined;
    comments?: string | string[] | undefined;
  },
  absent: readonly string[],
) {
  const linked = uuidSchema.safeParse(query.comment);
  const focusId = linked.success ? linked.data.toLowerCase() : undefined;
  const [comments, pinned] = await Promise.all([
    orNotFound(
      api.comments(postId, { limit: 20, cursor: cursorParam(query.comments) }),
      absent,
    ),
    focusId ? pinnedThread(api, postId, focusId) : null,
  ]);
  return {
    comments,
    pinned,
    pinnedMissing: focusId !== undefined && pinned === null,
    focusId,
  };
}
