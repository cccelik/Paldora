import { ApiClientError, type PaldoraApiClient } from '@paldora/api-client';
import { uuidSchema, type CommentItemView } from '@paldora/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommentThread } from '../../../components/comment-thread';
import type { ThreadData } from '../../../components/comment-thread-view';
import { PostCard } from '../../../components/post-card';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../lib/session';
import styles from '../../page-stack.module.css';

export const metadata = { title: 'Post' };

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
async function pinnedThread(
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

export default async function PostPage({
  params,
  searchParams,
}: PageProps<'/posts/[postId]'>) {
  const me = await completedUser();
  const id = uuidSchema.safeParse((await params).postId);
  if (!id.success) notFound();
  const query = await searchParams;
  const api = await apiClient();
  const post = await orNotFound(api.post(id.data), [
    'POST_NOT_FOUND',
    'VALIDATION_FAILED',
  ]);
  const linked = uuidSchema.safeParse(query.comment);
  const [comments, pinned] = await Promise.all([
    orNotFound(
      api.comments(post.id, { limit: 20, cursor: cursorParam(query.comments) }),
      ['POST_NOT_FOUND', 'VALIDATION_FAILED'],
    ),
    linked.success
      ? pinnedThread(api, post.id, linked.data.toLowerCase())
      : null,
  ]);
  const presets = me.preferences.reactionPresets;
  return (
    <div className={styles.stack}>
      <p>
        <Link href={`/boxes/${post.box.id}`}>← {post.box.name}</Link>
      </p>
      <PostCard
        post={post}
        presets={presets}
        showBox
        leaveAfterDelete
        permalink
      />
      <CommentThread
        postId={post.id}
        threads={comments.items}
        nextCursor={comments.nextCursor}
        pinned={pinned}
        pinnedMissing={linked.success && pinned === null}
        focusId={linked.success ? linked.data.toLowerCase() : undefined}
        presets={presets}
        canInteract={post.interactions.canInteract}
        commentCount={post.interactions.commentCount}
      />
    </div>
  );
}
