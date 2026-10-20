import { REAL_REACTION_KIND } from '@paldora/domain';
import type { NotificationView } from '@paldora/validation';
import { lifeUpdateHref } from './life-update-form';

/** How a notification reads, built only from what the API returned live. */
export function notificationSentence(notification: NotificationView): string {
  const actor = notification.actor.displayName;
  const where = `in ${notification.box.name}`;
  const yours = notification.lifeUpdateId ? 'your Life Update' : 'your post';
  const kind = notification.reaction?.kind;
  const reacted =
    kind === undefined
      ? 'reacted'
      : kind === REAL_REACTION_KIND
        ? 'sent a camera reaction'
        : `reacted ${kind}`;
  switch (notification.type) {
    case 'post.comment':
      return `${actor} commented on ${yours} ${where}`;
    case 'comment.reply':
      return `${actor} replied to your comment ${where}`;
    case 'post.reaction':
      return `${actor} ${reacted} to ${yours} ${where}`;
    case 'comment.reaction':
      return `${actor} ${reacted} to your comment ${where}`;
  }
}

/**
 * The post, with the comment pinned and focused when there is one. A Life
 * Update's backing post opens the Life Update on that Box's conversation.
 */
export function notificationHref(
  notification: Pick<NotificationView, 'postId' | 'commentId'> & {
    readonly lifeUpdateId?: string | null;
    readonly boxId?: string | null;
  },
): string {
  if (notification.lifeUpdateId) {
    return lifeUpdateHref(notification.lifeUpdateId, {
      boxId: notification.boxId,
      commentId: notification.commentId,
    });
  }
  const post = `/posts/${notification.postId}`;
  const { commentId } = notification;
  return commentId ? `${post}?comment=${commentId}#comment-${commentId}` : post;
}

/** The bell's visible badge: nothing at zero, "99+" past 99. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** The bell's accessible name. */
export function unreadLabel(count: number, capped = false): string {
  if (count <= 0) return 'Notifications';
  const shown = count > 99 || capped ? '99+' : String(count);
  return `Notifications, ${shown} unread`;
}
