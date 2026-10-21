import type { CommentRow } from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import type {
  CommentInteractionSummary,
  CommentItemView,
  CommentView,
  UserSummary,
} from '@paldora/validation';
import { isoOrNull } from '../../platform/http/iso.js';
import { emptyCommentSummary } from '../shared/interaction-summaries.js';

/** The columns a comment view needs; window queries select only these. */
export type CommentFields = Pick<
  CommentRow,
  | 'id'
  | 'postId'
  | 'authorUserId'
  | 'parentCommentId'
  | 'content'
  | 'status'
  | 'createdAt'
  | 'editedAt'
>;

export interface CommentRowWithVisibility {
  readonly comment: CommentFields;
  /** A block exists between the viewer and the author (either direction). */
  readonly hidden: boolean;
}

/** What the mapper needs beyond the row, gathered once per page. */
export interface CommentViewContext {
  readonly viewerId: string;
  readonly boxStatus: BoxStatus;
  readonly authors: ReadonlyMap<string, UserSummary>;
  readonly summaries: ReadonlyMap<string, CommentInteractionSummary>;
  readonly replyCounts: ReadonlyMap<string, number>;
}

export function toCommentView(
  comment: CommentFields,
  author: UserSummary,
  context: CommentViewContext,
): CommentView {
  return {
    id: comment.id,
    postId: comment.postId,
    parentCommentId: comment.parentCommentId,
    author,
    content: comment.content ?? '',
    createdAt: comment.createdAt.toISOString(),
    editedAt: isoOrNull(comment.editedAt),
    replyCount: context.replyCounts.get(comment.id) ?? 0,
    interactions: context.summaries.get(comment.id) ?? emptyCommentSummary(),
    canEdit:
      comment.authorUserId === context.viewerId &&
      context.boxStatus === 'active',
  };
}

/**
 * Hidden rows are reduced to an ID and a time, and tombstones to their place
 * in the thread, before they leave the service: a block or a deletion never
 * leaks text or authorship (ADR 013). Active comments whose author can no
 * longer be shown (suspended, say) are dropped, as posts are.
 */
export function toCommentItem(
  row: CommentRowWithVisibility,
  context: CommentViewContext,
): CommentItemView | null {
  const { comment } = row;
  const createdAt = comment.createdAt.toISOString();
  if (row.hidden) {
    return { kind: 'hidden', hidden: { id: comment.id, createdAt } };
  }
  if (comment.status === 'deleted') {
    return {
      kind: 'deleted',
      deleted: {
        id: comment.id,
        postId: comment.postId,
        parentCommentId: comment.parentCommentId,
        createdAt,
      },
    };
  }
  const author = context.authors.get(comment.authorUserId);
  return author
    ? { kind: 'comment', comment: toCommentView(comment, author, context) }
    : null;
}

/** IDs of the rows a viewer may see in full: their authors and summaries. */
export const visibleRows = (rows: readonly CommentRowWithVisibility[]) =>
  rows.filter((row) => !row.hidden && row.comment.status === 'active');
