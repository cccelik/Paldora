import type { LifeUpdateRow } from '@paldora/database';
import {
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_LABELS,
} from '@paldora/domain';
import type {
  LifeUpdateContextView,
  LifeUpdateSectionView,
  LifeUpdateView,
  PostInteractionSummary,
  PostMediaView,
  UserSummary,
} from '@paldora/validation';
import { isoOrNull } from '../platform/http/iso.js';
import { mayEdit, type AccessibleContext } from './life-update-access.js';

/** Non-empty sections in the canonical order, with their shared labels. */
export function toSections(
  sections: Readonly<Record<string, string>>,
): LifeUpdateSectionView[] {
  return LIFE_UPDATE_SECTION_KEYS.flatMap((key) => {
    const content = sections[key];
    return content
      ? [{ key, label: LIFE_UPDATE_SECTION_LABELS[key], content }]
      : [];
  });
}

/**
 * Alphabetical by Box name, ignoring case, then by Box ID so equal names
 * keep a stable order. Computed on read, because Box names can change.
 */
export function sortContexts<
  Context extends { box: { id: string; name: string } },
>(contexts: readonly Context[]): Context[] {
  return [...contexts].sort(
    (left, right) =>
      left.box.name.localeCompare(right.box.name, 'en', {
        sensitivity: 'base',
      }) ||
      (left.box.id < right.box.id ? -1 : left.box.id > right.box.id ? 1 : 0),
  );
}

/** Summary for a context whose interactions were not loaded (never shown). */
const noInteractions = (
  context: AccessibleContext,
): PostInteractionSummary => ({
  commentCount: 0,
  reactions: [],
  reactionCount: 0,
  realCount: 0,
  realPreview: [],
  viewerReaction: null,
  canInteract: context.boxStatus === 'active',
});

export interface LifeUpdateParts {
  readonly update: LifeUpdateRow;
  readonly author: UserSummary;
  readonly viewerId: string;
  readonly contexts: readonly AccessibleContext[];
  readonly media: readonly PostMediaView[];
  readonly interactions: ReadonlyMap<string, PostInteractionSummary>;
}

export function toLifeUpdateView(parts: LifeUpdateParts): LifeUpdateView {
  const { update, contexts } = parts;
  const views: LifeUpdateContextView[] = contexts.map((context) => ({
    postId: context.postId,
    box: { id: context.boxId, name: context.boxName },
    interactions:
      parts.interactions.get(context.postId) ?? noInteractions(context),
  }));
  return {
    id: update.id,
    author: parts.author,
    audience: update.audience,
    sections: toSections(update.sections),
    media: [...parts.media],
    createdAt: update.createdAt.toISOString(),
    editedAt: isoOrNull(update.editedAt),
    canEdit: mayEdit(update, parts.viewerId, contexts),
    contexts: sortContexts(views),
  };
}
