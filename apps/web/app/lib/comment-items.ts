import type { CommentItemView } from '@paldora/validation';

/** The ID of any comment row: a comment, a tombstone, or a placeholder. */
export function itemId(item: CommentItemView): string {
  if (item.kind === 'comment') return item.comment.id;
  return item.kind === 'deleted' ? item.deleted.id : item.hidden.id;
}
