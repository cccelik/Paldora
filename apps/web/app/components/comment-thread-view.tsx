'use client';

import { type CommentItemView, type CommentView } from '@paldora/validation';
import { useState } from 'react';
import { moreRepliesAction } from '../actions/interactions';
import { itemId } from '../lib/comment-items';
import { CommentComposer } from './comment-composer';
import {
  CommentEntry,
  CommentPlaceholder,
  type ReplyTarget,
} from './comment-row';
import styles from './comment-thread.module.css';
import { useToast } from './toast';
import { Button } from './ui';
export interface ThreadData {
  /** Null when the root is gone but the thread is linked to directly. */
  readonly root: CommentItemView | null;
  readonly rootId: string;
  readonly replies: readonly CommentItemView[];
  readonly replyCount: number;
}

function unique(items: readonly CommentItemView[]): CommentItemView[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = itemId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const moreText = (count: number) =>
  count === 1 ? 'View 1 more reply' : `View ${count} more replies`;

/**
 * One root and its single level of replies. Older replies load through a
 * Server Action; a reply written here appears at once, since the preview
 * only shows the oldest few.
 */
export function CommentThreadView({
  thread,
  postId,
  presets,
  canInteract,
  focusId,
}: {
  thread: ThreadData;
  postId: string;
  presets: readonly string[];
  canInteract: boolean;
  focusId?: string | undefined;
}) {
  const [loaded, setLoaded] = useState<readonly CommentItemView[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [posted, setPosted] = useState<readonly CommentItemView[]>([]);
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const showToast = useToast();

  const fromServer = unique([...thread.replies, ...loaded]);
  const replies = unique([...fromServer, ...posted]);
  const remaining =
    cursor === null ? 0 : Math.max(0, thread.replyCount - replies.length);

  const loadMore = async () => {
    setLoading(true);
    const result = await moreRepliesAction({
      commentId: thread.rootId,
      ...(cursor ? { cursor } : {}),
    });
    setLoading(false);
    if (result.status === 'error') {
      showToast({ message: result.message, tone: result.tone });
      return;
    }
    setLoaded((current) => [...current, ...result.data.items]);
    setCursor(result.data.nextCursor);
  };

  const onPosted = (comment: CommentView) => {
    setPosted((current) => [...current, { kind: 'comment', comment }]);
    setTarget(null);
  };

  return (
    <>
      {thread.root ? (
        <CommentEntry
          item={thread.root}
          presets={presets}
          canInteract={canInteract}
          onReply={setTarget}
          focus={focusId === thread.rootId}
        />
      ) : (
        <CommentPlaceholder kind="deleted" id={thread.rootId} />
      )}
      {replies.length > 0 ? (
        <ol className={styles.replies} aria-label="Replies">
          {replies.map((item) => (
            <li key={itemId(item)}>
              <CommentEntry
                item={item}
                presets={presets}
                canInteract={canInteract}
                onReply={setTarget}
                focus={focusId === itemId(item)}
              />
            </li>
          ))}
        </ol>
      ) : null}
      {remaining > 0 ? (
        <div className={styles.indent}>
          <Button variant="quiet" disabled={loading} onClick={loadMore}>
            {loading ? 'Loading…' : moreText(remaining)}
          </Button>
        </div>
      ) : null}
      {target && canInteract ? (
        <div className={styles.indent}>
          <CommentComposer
            postId={postId}
            replyTo={target}
            onCancel={() => setTarget(null)}
            onPosted={onPosted}
            autoFocus
          />
        </div>
      ) : null}
    </>
  );
}
