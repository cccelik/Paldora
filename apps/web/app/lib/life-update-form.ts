import {
  LIFE_UPDATE_MAX_BOXES,
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_TOTAL_MAX_LENGTH,
  type LifeUpdateSectionKey,
} from '@paldora/domain';

/** What someone typed into each section field, untrimmed. */
export type SectionDrafts = Readonly<
  Partial<Record<LifeUpdateSectionKey, string>>
>;

/** The form field that carries one section's text. */
export const sectionFieldName = (key: LifeUpdateSectionKey) => `section-${key}`;

/**
 * Characters that count against the 10,000 total: trimmed, as the server
 * stores them, so the counter never disagrees with the answer.
 */
export function sectionsTotal(drafts: SectionDrafts): number {
  return LIFE_UPDATE_SECTION_KEYS.reduce(
    (total, key) => total + (drafts[key]?.trim().length ?? 0),
    0,
  );
}

export const hasWrittenSection = (drafts: SectionDrafts) =>
  LIFE_UPDATE_SECTION_KEYS.some((key) => (drafts[key]?.trim().length ?? 0) > 0);

export interface DraftState {
  readonly drafts: SectionDrafts;
  readonly photoCount: number;
  readonly photosBusy: boolean;
  /** Absent for an edit: the audience is fixed. */
  readonly audience?: {
    readonly type: 'only_me' | 'boxes';
    readonly boxCount: number;
  };
}

/**
 * Why the form cannot be sent yet, in words, or null when it can. The
 * server checks all of this again; this only explains the disabled button.
 */
export function draftProblem(state: DraftState): string | null {
  if (state.photosBusy) return 'Wait for the photos to finish preparing.';
  if (sectionsTotal(state.drafts) > LIFE_UPDATE_TOTAL_MAX_LENGTH) {
    return 'A Life Update can be up to 10,000 characters in total.';
  }
  if (!hasWrittenSection(state.drafts) && state.photoCount === 0) {
    return 'Write at least one section or add a photo.';
  }
  const { audience } = state;
  if (audience?.type === 'boxes') {
    if (audience.boxCount === 0) return 'Choose at least one Box, or Only me.';
    if (audience.boxCount > LIFE_UPDATE_MAX_BOXES) {
      return 'A Life Update can go to up to 20 Boxes.';
    }
  }
  return null;
}

/**
 * Roving focus for a horizontal tab list: arrows wrap, Home and End jump.
 * Returns the tab to move to, or null when the key is not a tab key.
 */
export function nextTabIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * A Life Update's page, opened on one Box's conversation, optionally with a
 * comment pinned (deep links) or an older-comments cursor.
 */
export function lifeUpdateHref(
  lifeUpdateId: string,
  options: {
    boxId?: string | null | undefined;
    commentId?: string | null | undefined;
    commentsCursor?: string | undefined;
  } = {},
): string {
  const query = new URLSearchParams();
  if (options.boxId) query.set('box', options.boxId);
  if (options.commentId) query.set('comment', options.commentId);
  if (options.commentsCursor) query.set('comments', options.commentsCursor);
  const search = query.size > 0 ? `?${query.toString()}` : '';
  const hash = options.commentId
    ? `#comment-${options.commentId}`
    : options.commentsCursor
      ? '#comments'
      : '';
  return `/life-updates/${lifeUpdateId}${search}${hash}`;
}
