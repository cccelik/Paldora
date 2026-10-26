'use client';

import { setFirebasePostReactionAction } from '@/actions/firebase-reactions';
import { setCameraReactionAction } from '@/actions/reaction-media';
import styles from '@/components/interactions/post-interactions.module.css';
import { ReactionBar } from '@/components/interactions/reaction-bar';
import { ReactionCamera } from '@/components/interactions/reaction-camera';
import { RealStrip } from '@/components/interactions/real-reaction-strip';
import { REAL_REACTION_KIND } from '@paldora/domain';
import type { PostInteractionSummary } from '@paldora/validation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';

export function FirebasePostReactions({
  boxId,
  postId,
  initialSummary,
  presets,
  active,
  commentsHref,
}: {
  boxId: string;
  postId: string;
  initialSummary: PostInteractionSummary;
  presets: readonly string[];
  active: boolean;
  commentsHref?: string;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.interactions}>
      <ReactionBar
        summary={summary}
        presets={presets}
        canInteract={active && summary.canInteract}
        react={async (nextKind) => {
          const result = await setFirebasePostReactionAction({
            boxId,
            postId,
            kind: nextKind,
          });
          if (result.status === 'success') {
            setSummary(result.data);
            setError(null);
          } else setError(result.message);
        }}
        extra={
          active ? (
            <ReactionCamera
              boxId={boxId}
              hasCameraReaction={
                summary.viewerReaction?.kind === REAL_REACTION_KIND
              }
              sendReaction={async (mediaAssetId) => {
                const result = await setCameraReactionAction({
                  postId,
                  mediaAssetId,
                });
                if (result.status === 'success') setSummary(result.data);
                else setError(result.message);
                return result;
              }}
              removeReaction={() => {
                void setFirebasePostReactionAction({
                  boxId,
                  postId,
                  kind: null,
                }).then((result) => {
                  if (result.status === 'success') setSummary(result.data);
                  else setError(result.message);
                });
              }}
            />
          ) : null
        }
      />
      <RealStrip postId={postId} summary={summary} />
      <Link
        className={styles.comments}
        href={(commentsHref ?? `/posts/${postId}#comments`) as Route}
      >
        {summary.commentCount === 0
          ? 'Comment'
          : `${summary.commentCount} ${summary.commentCount === 1 ? 'comment' : 'comments'}`}
      </Link>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
