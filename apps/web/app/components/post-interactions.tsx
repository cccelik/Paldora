'use client';

import type { PostInteractionSummary } from '@paldora/validation';
import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useRef } from 'react';
import {
  postSummaryAction,
  setPostReactionAction,
} from '../actions/interactions';
import { isInteractionHint, type RealtimeHint } from '../lib/realtime';
import { ReactionBar } from './reaction-bar';
import { useOptimisticReaction } from './use-optimistic-reaction';
import { useRealtimeHint } from './use-realtime-hint';
import styles from './post-interactions.module.css';

const REFETCH_DEBOUNCE_MS = 500;

const commentsText = (count: number) =>
  count === 1 ? '1 comment' : `${count.toLocaleString('en')} comments`;

/** Up to four camera reactions, when the summary already carries them. */
function RealStrip({ summary }: { summary: PostInteractionSummary }) {
  if (summary.realPreview.length === 0) return null;
  return (
    <div className={styles.real}>
      <ul className={styles.realList} aria-label="Camera reactions">
        {summary.realPreview.map((preview) => (
          <li key={preview.user.id}>
            <img
              className={styles.realImage}
              src={preview.thumbnailUrl}
              alt={`${preview.user.displayName}’s camera reaction`}
              referrerPolicy="no-referrer"
            />
          </li>
        ))}
      </ul>
      {summary.realCount > summary.realPreview.length ? (
        <span className={styles.meta}>
          +{summary.realCount - summary.realPreview.length} more
        </span>
      ) : null}
    </div>
  );
}

/**
 * A post's reactions and comment count. The summary is server data held as
 * `useOptimistic`: a press shows at once, the action's answer replaces it,
 * and a realtime hint for this post refetches only this summary.
 */
export function PostInteractions({
  postId,
  summary: initial,
  presets,
  commentsLink = true,
}: {
  postId: string;
  summary: PostInteractionSummary;
  presets: readonly string[];
  /** Feeds link to the permalink; the permalink itself shows the thread. */
  commentsLink?: boolean;
}) {
  const { shown, setSummary, react } = useOptimisticReaction(initial, (kind) =>
    setPostReactionAction({ postId, kind }),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const refetch = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void postSummaryAction(postId).then((result) => {
        if (result.status === 'success') setSummary(result.data);
      });
    }, REFETCH_DEBOUNCE_MS);
  }, [postId, setSummary]);

  useRealtimeHint((hint: RealtimeHint) => {
    if (commentsLink && isInteractionHint(hint) && hint.postId === postId) {
      refetch();
    }
  });

  const href = `/posts/${postId}#comments`;
  return (
    <div className={styles.interactions}>
      <ReactionBar
        summary={shown}
        presets={presets}
        canInteract={shown.canInteract}
        react={react}
      />
      <RealStrip summary={shown} />
      {commentsLink ? (
        <Link className={styles.comments} href={href as Route}>
          {shown.commentCount === 0
            ? 'Comment'
            : commentsText(shown.commentCount)}
        </Link>
      ) : null}
    </div>
  );
}
