'use client';

import type {
  PostInteractions,
  ReactionKind,
  ReactionPresets,
} from '@paldora/domain';
import { EmojiReactionPicker } from './emoji-reaction-picker';

export function ReactionBar({
  interactions,
  pending,
  onReaction,
  onCamera,
  onComments,
  presets,
}: {
  interactions: PostInteractions;
  pending: boolean;
  onReaction: (kind: ReactionKind | null) => void;
  onCamera: () => void;
  onComments: () => void;
  presets: ReactionPresets;
}) {
  return (
    <div className="reaction-area">
      <RealReactionStrip interactions={interactions} />
      <div className="reaction-bar" aria-label="Post interactions">
        <div className="reaction-controls">
          {interactions.currentUserReaction === null && (
            <EmojiReactionPicker
              currentReaction={null}
              label="React"
              onCamera={onCamera}
              onReaction={onReaction}
              pending={pending}
              presets={presets}
            />
          )}
          <ReactionTotals
            interactions={interactions}
            onCamera={onCamera}
            onReaction={onReaction}
            pending={pending}
            presets={presets}
          />
        </div>
        <button
          className="comment-count-button"
          onClick={onComments}
          type="button"
        >
          <span aria-hidden="true">◌</span>
          {interactions.commentCount}{' '}
          {interactions.commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </div>
    </div>
  );
}

function RealReactionStrip({
  interactions,
}: {
  interactions: PostInteractions;
}) {
  if (interactions.realReactions.length === 0) return null;
  return (
    <div className="real-reactions" aria-label="Camera reactions">
      {interactions.realReactions.map((reaction) => (
        <figure key={reaction.mediaAssetId} title={`@${reaction.username}`}>
          {reaction.thumbnailUrl ? (
            <img
              alt={`${reaction.displayName}'s camera reaction`}
              src={reaction.thumbnailUrl}
            />
          ) : (
            <span aria-label="Camera reaction processing">📷</span>
          )}
          <figcaption>@{reaction.username}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function ReactionTotals({
  interactions,
  pending,
  presets,
  onCamera,
  onReaction,
}: {
  interactions: PostInteractions;
  pending: boolean;
  presets: ReactionPresets;
  onCamera: () => void;
  onReaction: (kind: ReactionKind | null) => void;
}) {
  const realCount = interactions.reactions.find(
    ({ kind }) => kind === 'real',
  )?.count;
  return (
    <div className="reaction-summary" aria-label="Reaction totals">
      {interactions.reactions.map(({ kind, count }) => {
        if (kind === 'real' || count === 0) return null;
        if (interactions.currentUserReaction === kind) {
          return (
            <EmojiReactionPicker
              currentReaction={kind}
              key={kind}
              label={`Change your reaction from ${kind}`}
              onCamera={onCamera}
              onReaction={onReaction}
              pending={pending}
              presets={presets}
              triggerContent={
                <>
                  <span aria-hidden="true">{kind}</span>
                  {count}
                </>
              }
            />
          );
        }
        return (
          <button
            aria-label={`${kind}, ${count} ${count === 1 ? 'reaction' : 'reactions'}`}
            aria-pressed={false}
            disabled={pending}
            key={kind}
            onClick={() => onReaction(kind)}
            type="button"
          >
            <span aria-hidden="true">{kind}</span>
            {count}
          </button>
        );
      })}
      {Boolean(realCount) && interactions.currentUserReaction === 'real' ? (
        <EmojiReactionPicker
          currentReaction="real"
          label="Change your camera reaction"
          onCamera={onCamera}
          onReaction={onReaction}
          pending={pending}
          presets={presets}
          triggerContent={
            <>
              <span aria-hidden="true">📸</span>
              {realCount}
            </>
          }
        />
      ) : (
        Boolean(realCount) && (
          <span className="real-reaction-total">📸 {realCount}</span>
        )
      )}
    </div>
  );
}
