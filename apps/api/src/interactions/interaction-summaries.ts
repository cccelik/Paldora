import {
  REACTION_SUMMARY_KIND_LIMIT,
  REAL_REACTION_KIND,
} from '@paldora/domain';
import type {
  CommentInteractionSummary,
  ReactionCountView,
  UserSummary,
} from '@paldora/validation';

export interface KindCount {
  readonly kind: string;
  readonly count: number;
}

export interface RealPreview {
  readonly user: UserSummary;
  readonly thumbnailUrl: string;
}

export interface KindSummary {
  readonly reactions: ReactionCountView[];
  readonly reactionCount: number;
  readonly realCount: number;
}

/**
 * Turns grouped counts into the summary shape: emoji kinds most used first
 * (ties by kind, so the order is stable), at most eight; camera reactions
 * counted separately but included in the total.
 */
export function summarizeKinds(rows: readonly KindCount[]): KindSummary {
  let reactionCount = 0;
  let realCount = 0;
  const emoji: ReactionCountView[] = [];
  for (const { kind, count } of rows) {
    reactionCount += count;
    if (kind === REAL_REACTION_KIND) realCount += count;
    else emoji.push({ kind, count });
  }
  emoji.sort(
    (first, second) =>
      second.count - first.count ||
      (first.kind < second.kind ? -1 : first.kind > second.kind ? 1 : 0),
  );
  return {
    reactions: emoji.slice(0, REACTION_SUMMARY_KIND_LIMIT),
    reactionCount,
    realCount,
  };
}

export const emptyCommentSummary = (): CommentInteractionSummary => ({
  reactions: [],
  reactionCount: 0,
  viewerReaction: null,
});
