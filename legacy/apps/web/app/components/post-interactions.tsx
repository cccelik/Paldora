'use client';

import type {
  CommentId,
  PostId,
  PostInteractions as PostInteractionState,
  UserId,
  ReactionPresets,
} from '@paldora/domain';
import { useEffect, useState } from 'react';
import { CommentForm, CommentThread } from './comment-thread';
import { ReactionBar } from './reaction-bar';
import { ReactionCamera } from './reaction-camera';
import { Toast, ToastViewport } from './ui';
import { usePostInteractions } from './use-post-interactions';

export function PostInteractions({
  postId,
  currentUserId,
  initial,
  presets,
  quickLikeRequest = 0,
}: {
  postId: PostId;
  currentUserId: UserId;
  initial: PostInteractionState;
  presets: ReactionPresets;
  quickLikeRequest?: number;
}) {
  const state = usePostInteractions(postId, initial);
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => {
    if (quickLikeRequest > 0) void state.setReaction('👍');
  }, [quickLikeRequest, state.setReaction]);
  return (
    <section className="post-interactions">
      <ReactionBar
        interactions={state.summary}
        onCamera={() => setCameraOpen(true)}
        onComments={state.toggleComments}
        onReaction={(kind) => void state.setReaction(kind)}
        pending={state.reactionPending}
        presets={presets}
      />
      {cameraOpen && (
        <ReactionCamera
          onClose={() => setCameraOpen(false)}
          onSubmit={state.setRealReaction}
          pending={state.reactionPending}
        />
      )}
      {state.open && (
        <div className="comment-panel">
          <CommentForm
            label="Write a comment…"
            onSubmit={(content) => state.createComment(content)}
            pending={state.busyCommentId === (postId as unknown as CommentId)}
            submitLabel="Comment"
          />
          {state.loading && !state.loaded ? (
            <p className="comment-loading" role="status">
              Loading comments…
            </p>
          ) : (
            <CommentThread
              busyCommentId={state.busyCommentId}
              busyReactionCommentId={state.busyReactionCommentId}
              comments={state.comments}
              currentUserId={currentUserId}
              onCreate={state.createComment}
              onDelete={state.deleteComment}
              onUpdate={state.updateComment}
              onReaction={state.setCommentReaction}
              presets={presets}
            />
          )}
          {state.nextCursor && (
            <button
              className="button-quiet comment-load-more"
              disabled={state.loading}
              onClick={() =>
                void state.loadComments(state.nextCursor ?? undefined)
              }
              type="button"
            >
              {state.loading ? 'Loading…' : 'Show older comments'}
            </button>
          )}
        </div>
      )}
      {state.message && (
        <ToastViewport>
          <Toast
            message={state.message.text}
            onDismiss={() => state.setMessage(null)}
            tone={state.message.tone}
          />
        </ToastViewport>
      )}
    </section>
  );
}
