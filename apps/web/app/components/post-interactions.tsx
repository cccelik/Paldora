'use client';

import { REAL_REACTION_KIND } from '@paldora/domain';
import type { PostInteractionSummary } from '@paldora/validation';
import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useRef } from 'react';
import {
  postSummaryAction,
  setPostReactionAction,
} from '../actions/interactions';
import { setCameraReactionAction } from '../actions/reaction-media';
import { isInteractionHint, type RealtimeHint } from '../lib/realtime';
import { ReactionBar } from './reaction-bar';
import { ReactionCamera } from './reaction-camera';
import { useOptimisticReaction } from './use-optimistic-reaction';
import { useRealtimeHint } from './use-realtime-hint';
import styles from './post-interactions.module.css';

const REFETCH_DEBOUNCE_MS = 500;

const commentsText = (count: number) =>
  count === 1 ? '1 comment' : `${count.toLocaleString('en')} comments`;

/**
 * Up to four camera reactions, with a link to everyone who reacted when
 * there are more than the strip shows.
 */
function RealStrip({
  postId,
  summary,
}: {
  postId: string;
  summary: PostInteractionSummary;
}) {
  if (summary.realPreview.length === 0) return null;
  const more = summary.realCount - summary.realPreview.length;
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
      {more > 0 ? <span className={styles.meta}>+{more} more</span> : null}
      <Link
        className={styles.everyone}
        href={`/posts/${postId}/reactions?kind=${REAL_REACTION_KIND}` as Route}
      >
        See all camera reactions
      </Link>
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
  boxId,
  summary: initial,
  presets,
  commentsLink = true,
  commentsHref,
}: {
  postId: string;
  /** The post's Box: a camera image is scoped to it. */
  boxId: string;
  summary: PostInteractionSummary;
  presets: readonly string[];
  /** Feeds link to the permalink; the permalink itself shows the thread. */
  commentsLink?: boolean;
  /** Where "N comments" leads; a Life Update opens its own page instead. */
  commentsHref?: string | undefined;
}) {
  const { shown, setSummary, react, run } = useOptimisticReaction(
    initial,
    (kind) => setPostReactionAction({ postId, kind }),
  );
  const sendCamera = (mediaAssetId: string) =>
    run(REAL_REACTION_KIND, () =>
      setCameraReactionAction({ postId, mediaAssetId }),
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

  const href = commentsHref ?? `/posts/${postId}#comments`;
  return (
    <div className={styles.interactions}>
      <ReactionBar
        summary={shown}
        presets={presets}
        canInteract={shown.canInteract}
        react={react}
        extra={
          <ReactionCamera
            boxId={boxId}
            hasCameraReaction={
              shown.viewerReaction?.kind === REAL_REACTION_KIND
            }
            sendReaction={sendCamera}
            removeReaction={() => void react(null)}
            triggerClassName={styles.camera}
          />
        }
      />
      <RealStrip postId={postId} summary={shown} />
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
