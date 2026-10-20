import type { NotificationRow } from '@paldora/database';
import type { NotificationView, UserSummary } from '@paldora/validation';

export interface NotificationReadRow {
  readonly notification: NotificationRow;
  readonly box: { readonly id: string; readonly name: string };
  /** Set when the post is a Life Update's backing post. */
  readonly lifeUpdateId: string | null;
  readonly postReactionKind: string | null;
  readonly commentReactionKind: string | null;
  readonly actor: UserSummary;
  /** A camera reaction's signed thumbnail, when there is one. */
  readonly thumbnailUrl: string | null;
}

function reactionOf(row: NotificationReadRow): NotificationView['reaction'] {
  const kind =
    row.notification.type === 'post.reaction'
      ? row.postReactionKind
      : row.notification.type === 'comment.reaction'
        ? row.commentReactionKind
        : null;
  if (kind === null) return null;
  return row.thumbnailUrl ? { kind, thumbnailUrl: row.thumbnailUrl } : { kind };
}

/**
 * The recipient's view, built from live rows. Deep links come from the IDs:
 * `/posts/{postId}`, plus `?comment={commentId}` when there is a comment;
 * for a Life Update's backing post, `/life-updates/{lifeUpdateId}?box=…`.
 */
export function toNotificationView(row: NotificationReadRow): NotificationView {
  const { notification } = row;
  return {
    id: notification.id,
    type: notification.type as NotificationView['type'],
    actor: row.actor,
    postId: notification.postId,
    lifeUpdateId: row.lifeUpdateId,
    commentId: notification.commentId,
    box: row.box,
    reaction: reactionOf(row),
    read: notification.readAt !== null,
    createdAt: notification.createdAt.toISOString(),
  };
}
