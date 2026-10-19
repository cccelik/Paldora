'use client';

import type {
  CommentInteractions,
  ReactionKind,
  ReactionPresets,
} from '@paldora/domain';
import { EmojiReactionPicker } from './emoji-reaction-picker';

export function CommentReactionBar({
  commentAuthor,
  interactions,
  pending,
  presets,
  onReaction,
}: {
  commentAuthor: string;
  interactions: CommentInteractions;
  pending: boolean;
  presets: ReactionPresets;
  onReaction: (kind: ReactionKind | null) => void;
}) {
  return (
    <div className="comment-reaction-bar">
      {interactions.currentUserReaction === null && (
        <EmojiReactionPicker
          currentReaction={null}
          label={`React to ${commentAuthor}'s comment`}
          onReaction={onReaction}
          pending={pending}
          presets={presets}
        />
      )}
      <div className="comment-reaction-summary" aria-label="Comment reactions">
        {interactions.reactions.map(({ kind, count }) => {
          if (interactions.currentUserReaction === kind) {
            return (
              <EmojiReactionPicker
                currentReaction={kind}
                key={kind}
                label={`Change your reaction to ${commentAuthor}'s comment from ${kind}`}
                onReaction={onReaction}
                pending={pending}
                presets={presets}
                triggerContent={
                  <>
                    <span aria-hidden="true">{kind}</span> {count}
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
              <span aria-hidden="true">{kind}</span> {count}
            </button>
          );
        })}
      </div>
    </div>
  );
}
