import type { CommentThreadView as ThreadPageItem } from '@paldora/validation';
import { itemId } from '../lib/comment-items';
import { CommentComposer } from './comment-composer';
import { CommentThreadView, type ThreadData } from './comment-thread-view';
import { MoreLink } from './more-link';
import { EmptyState } from './ui';
import styles from './comment-thread.module.css';

const toThreadData = (thread: ThreadPageItem): ThreadData => ({
  root: thread.root,
  rootId: itemId(thread.root),
  replies: thread.replies,
  replyCount: thread.replyCount,
});

/**
 * A post's comments: the composer, a linked thread pinned on top, then roots
 * newest first, each with one level of replies. Rendered on the server; only
 * the threads and composer are client components.
 */
export function CommentThread({
  postId,
  threads,
  nextCursor,
  pinned,
  pinnedMissing = false,
  focusId,
  presets,
  canInteract,
  commentCount,
  olderHref,
}: {
  postId: string;
  threads: readonly ThreadPageItem[];
  nextCursor: string | null;
  pinned?: ThreadData | null | undefined;
  /** The link pointed at a comment that is no longer visible. */
  pinnedMissing?: boolean;
  focusId?: string | undefined;
  presets: readonly string[];
  canInteract: boolean;
  commentCount: number;
  /** The "older comments" link, for pages other than the post's own. */
  olderHref?: string | undefined;
}) {
  const rest = threads
    .map(toThreadData)
    .filter((thread) => thread.rootId !== pinned?.rootId);
  const title =
    commentCount === 1
      ? '1 comment'
      : `${commentCount.toLocaleString('en')} comments`;
  return (
    <section
      id="comments"
      className={styles.section}
      aria-labelledby="comments-title"
    >
      <h2 id="comments-title" className={styles.title}>
        {title}
      </h2>
      {canInteract ? (
        <CommentComposer postId={postId} />
      ) : (
        <p className={styles.note}>
          This Box is archived. Comments and reactions are read-only.
        </p>
      )}
      {pinnedMissing ? (
        <p className={styles.note}>That comment is no longer available.</p>
      ) : null}
      {pinned ? (
        <div className={styles.pinned} aria-label="Linked comment" role="group">
          <CommentThreadView
            thread={pinned}
            postId={postId}
            presets={presets}
            canInteract={canInteract}
            focusId={focusId}
          />
        </div>
      ) : null}
      {rest.length === 0 && !pinned ? (
        <EmptyState>No comments yet.</EmptyState>
      ) : (
        <ol className={styles.threads} aria-label="Comments">
          {rest.map((thread) => (
            <li key={thread.rootId} className={styles.thread}>
              <CommentThreadView
                thread={thread}
                postId={postId}
                presets={presets}
                canInteract={canInteract}
              />
            </li>
          ))}
        </ol>
      )}
      {nextCursor ? (
        <MoreLink
          href={
            olderHref ??
            `/posts/${postId}?comments=${encodeURIComponent(nextCursor)}#comments`
          }
          label="Show older comments"
        />
      ) : null}
    </section>
  );
}
