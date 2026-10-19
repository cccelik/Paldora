import type { PostInteractionSummary } from '@paldora/validation';
import { describe, expect, it } from 'vitest';
import {
  countOf,
  reactionButtonLabel,
  reactionKinds,
  withViewerReaction,
} from './reaction-summary';

const summary: PostInteractionSummary = {
  commentCount: 2,
  reactions: [
    { kind: '👍', count: 2 },
    { kind: '🎉', count: 1 },
  ],
  reactionCount: 3,
  realCount: 0,
  realPreview: [],
  viewerReaction: null,
  canInteract: true,
};

describe('withViewerReaction', () => {
  it('adds, changes, and removes the viewer’s reaction', () => {
    const added = withViewerReaction(summary, '👍');
    expect(countOf(added, '👍')).toBe(3);
    expect(added.reactionCount).toBe(4);
    expect(added.viewerReaction).toEqual({ kind: '👍' });

    const changed = withViewerReaction(added, '🦄');
    expect(countOf(changed, '👍')).toBe(2);
    expect(countOf(changed, '🦄')).toBe(1);
    expect(changed.reactionCount).toBe(4);

    const removed = withViewerReaction(changed, null);
    expect(removed.reactions).toEqual(summary.reactions);
    expect(removed.reactionCount).toBe(3);
    expect(removed.viewerReaction).toBeNull();
  });

  it('drops a kind whose count reaches zero', () => {
    const mine = { ...summary, viewerReaction: { kind: '🎉' } };
    expect(withViewerReaction(mine, null).reactions).toEqual([
      { kind: '👍', count: 2 },
    ]);
  });

  it('moves a camera reaction out of the real count', () => {
    const real = {
      ...summary,
      realCount: 1,
      reactionCount: 4,
      viewerReaction: { kind: 'real' },
    };
    const next = withViewerReaction(real, '👍');
    expect(next.realCount).toBe(0);
    expect(next.reactionCount).toBe(4);
    expect(countOf(next, '👍')).toBe(3);
  });

  it('counts a new camera reaction as real, never as an emoji kind', () => {
    const mine = { ...summary, viewerReaction: { kind: '👍' } };
    const next = withViewerReaction(mine, 'real');
    expect(next.realCount).toBe(1);
    expect(next.reactionCount).toBe(3);
    expect(countOf(next, '👍')).toBe(1);
    expect(next.reactions.some((reaction) => reaction.kind === 'real')).toBe(
      false,
    );
    expect(next.viewerReaction).toEqual({ kind: 'real' });

    const fresh = withViewerReaction(summary, 'real');
    expect(fresh.realCount).toBe(1);
    expect(fresh.reactionCount).toBe(4);
  });

  it('returns the same summary when nothing changes', () => {
    expect(withViewerReaction(summary, null)).toBe(summary);
  });
});

describe('labels and kinds', () => {
  it('names the emoji and the count', () => {
    expect(reactionButtonLabel('👍', 3)).toBe('React with 👍. 3 people');
    expect(reactionButtonLabel('👍', 1)).toBe('React with 👍. 1 person');
    expect(reactionButtonLabel('👍', 0)).toBe('React with 👍');
  });

  it('lists presets first, then other kinds in use', () => {
    expect(reactionKinds(['👍', '❤️'], summary)).toEqual(['👍', '❤️', '🎉']);
    expect(
      reactionKinds(['👍'], { ...summary, viewerReaction: { kind: 'real' } }),
    ).toEqual(['👍', '🎉']);
  });
});
