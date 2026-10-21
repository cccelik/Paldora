'use client';

import { EmojiChooser } from '@/components/interactions/emoji-chooser';
import styles from '@/components/interactions/reaction-bar.module.css';
import {
  countOf,
  reactionButtonLabel,
  reactionKinds,
  type ReactionSummaryLike,
} from '@/lib/interactions/reaction-summary';
import { idleTapGuard, settle, tap } from '@/lib/interactions/tap-guard';
import { useRef, type ReactNode } from 'react';
type SetReaction = (kind: string | null) => Promise<void>;

/**
 * Every press goes through the tap guard: one request at a time, and a
 * second press within the double-tap window is ignored, so a quick double
 * tap on 👍 leaves it set instead of toggling it off again.
 */
function useGuardedReact(react: SetReaction) {
  const guard = useRef(idleTapGuard);
  return (kind: string | null) => {
    const result = tap(guard.current, Date.now());
    if (!result.accepted) return;
    guard.current = result.state;
    void react(kind).finally(() => {
      guard.current = settle(guard.current);
    });
  };
}

/** Counts only, for an archived Box: nothing to press. */
function ReadOnlyReactions({ summary }: { summary: ReactionSummaryLike }) {
  if (summary.reactions.length === 0) return null;
  return (
    <ul className={styles.bar} aria-label="Reactions">
      {summary.reactions.map((reaction) => (
        <li key={reaction.kind} className={styles.static}>
          {reaction.kind} {reaction.count}
        </li>
      ))}
    </ul>
  );
}

/**
 * The reaction controls for a post or a comment. Posts show the viewer's
 * five presets plus any other emoji in use; comments (`compact`) show only
 * emoji in use, with the presets inside the chooser. `extra` holds controls
 * that belong at the end of the bar (the camera button, on posts).
 */
export function ReactionBar({
  summary,
  presets,
  canInteract,
  react,
  compact = false,
  label = 'Reactions',
  extra,
}: {
  summary: ReactionSummaryLike;
  presets: readonly string[];
  canInteract: boolean;
  react: SetReaction;
  compact?: boolean;
  label?: string;
  extra?: ReactNode;
}) {
  const press = useGuardedReact(react);
  if (!canInteract) return <ReadOnlyReactions summary={summary} />;
  const mine = summary.viewerReaction?.kind ?? null;
  const kinds = compact
    ? summary.reactions.map((reaction) => reaction.kind)
    : reactionKinds(presets, summary);
  return (
    <ul className={styles.bar} aria-label={label}>
      {kinds.map((kind) => {
        const count = countOf(summary, kind);
        return (
          <li key={kind}>
            <button
              type="button"
              className={styles.reaction}
              aria-pressed={mine === kind}
              aria-label={reactionButtonLabel(kind, count)}
              onClick={() => press(mine === kind ? null : kind)}
            >
              <span aria-hidden="true" className={styles.emoji}>
                {kind}
              </span>
              {count > 0 ? (
                <span aria-hidden="true" className={styles.count}>
                  {count}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
      <li>
        <EmojiChooser
          title="Choose a reaction"
          trigger={compact ? 'React' : 'More'}
          triggerLabel={compact ? 'React to this comment' : 'More reactions'}
          triggerClassName={styles.more}
          presets={compact ? presets : []}
          choiceLabel={(emoji) => `React with ${emoji}`}
          onChoose={(emoji) => press(emoji)}
        />
      </li>
      {extra ? <li>{extra}</li> : null}
    </ul>
  );
}
