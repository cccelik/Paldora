import { REAL_REACTION_KIND } from '@paldora/domain';
import {
  type CommentInteractionSummary,
  type ReactionCountView,
} from '@paldora/validation';
/** The fields every reaction summary (post or comment) shares. */
export interface ReactionSummaryLike {
  readonly reactions: readonly ReactionCountView[];
  readonly reactionCount: number;
  readonly viewerReaction: { readonly kind: string } | null;
}

function adjust(
  reactions: readonly ReactionCountView[],
  kind: string,
  delta: number,
): ReactionCountView[] {
  const found = reactions.some((reaction) => reaction.kind === kind);
  const next = found
    ? reactions.map((reaction) =>
        reaction.kind === kind
          ? { kind, count: reaction.count + delta }
          : reaction,
      )
    : delta > 0
      ? [...reactions, { kind, count: delta }]
      : [...reactions];
  return next.filter((reaction) => reaction.count > 0);
}

/**
 * The summary as it will look once the viewer's reaction is `kind` (an
 * emoji, `real` for a camera image, or null to remove it). One reaction per
 * person, so a new kind replaces the old one: a camera image counts in
 * `realCount`, never in `reactions`. Used only as the optimistic value; the
 * server's answer (with the signed preview strip) replaces it.
 */
export function withViewerReaction<Summary extends ReactionSummaryLike>(
  summary: Summary,
  kind: string | null,
): Summary {
  const previous = summary.viewerReaction?.kind ?? null;
  if (previous === kind) return summary;
  let reactions: ReactionCountView[] = [...summary.reactions];
  let reactionCount = summary.reactionCount;
  let realChange = 0;
  if (previous === REAL_REACTION_KIND) realChange = -1;
  else if (previous !== null) reactions = adjust(reactions, previous, -1);
  if (previous !== null) reactionCount -= 1;
  if (kind === REAL_REACTION_KIND) realChange += 1;
  else if (kind !== null) reactions = adjust(reactions, kind, 1);
  if (kind !== null) reactionCount += 1;
  const next = {
    ...summary,
    reactions,
    reactionCount: Math.max(0, reactionCount),
    viewerReaction: kind === null ? null : { kind },
  };
  if ('realCount' in summary && typeof summary.realCount === 'number') {
    return { ...next, realCount: Math.max(0, summary.realCount + realChange) };
  }
  return next;
}

export function countOf(summary: ReactionSummaryLike, kind: string): number {
  return (
    summary.reactions.find((reaction) => reaction.kind === kind)?.count ?? 0
  );
}

const people = (count: number) =>
  count === 1 ? '1 person' : `${count.toLocaleString('en')} people`;

/** "React with 👍. 3 people" — the count is part of the name. */
export function reactionButtonLabel(kind: string, count: number): string {
  return count > 0
    ? `React with ${kind}. ${people(count)}`
    : `React with ${kind}`;
}

/** Kinds to show as buttons: the presets first, then anything else used. */
export function reactionKinds(
  presets: readonly string[],
  summary: ReactionSummaryLike,
): string[] {
  const kinds = [...presets];
  for (const reaction of summary.reactions) {
    if (!kinds.includes(reaction.kind)) kinds.push(reaction.kind);
  }
  const mine = summary.viewerReaction?.kind;
  if (mine && mine !== REAL_REACTION_KIND && !kinds.includes(mine)) {
    kinds.push(mine);
  }
  return kinds;
}

/** A comment's summary before anyone reacted (for comments made just now). */
export const emptyCommentSummary: CommentInteractionSummary = {
  reactions: [],
  reactionCount: 0,
  viewerReaction: null,
};
