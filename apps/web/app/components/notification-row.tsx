import type { Notification } from '@paldora/domain';
import Link from 'next/link';
import { markNotificationReadAction } from '../actions/interactions';
import { InitialAvatar } from './ui';

export function NotificationRow({
  notification,
}: {
  notification: Notification;
}) {
  return (
    <article
      className={`notification-row${notification.read ? '' : ' unread'}`}
    >
      <InitialAvatar
        className="notification-avatar"
        imageUrl={notification.actor.avatarUrl}
        length={2}
        name={notification.actor.displayName}
      />
      <div>
        <p>
          <strong>{notification.actor.displayName}</strong>{' '}
          <span>{notificationMessage(notification.type)}</span>
        </p>
        <span>
          @{notification.actor.username} ·{' '}
          <time dateTime={notification.createdAt}>
            {formatNotificationDate(notification.createdAt)}
          </time>
        </span>
      </div>
      <div className="notification-row-actions">
        <Link
          className="button-secondary compact-button"
          href={
            notification.lifeUpdateId
              ? `/life-updates/${notification.lifeUpdateId}?post=${notification.postId}`
              : `/posts/${notification.postId}`
          }
        >
          View
        </Link>
        {!notification.read && (
          <form action={markNotificationReadAction.bind(null, notification.id)}>
            <button className="button-quiet compact-button" type="submit">
              Mark read
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function notificationMessage(type: Notification['type']): string {
  if (type === 'life_update.published') return 'shared a Life Update with you.';
  if (type === 'comment.reply') return 'replied to your comment.';
  if (type === 'post.reaction') return 'reacted to your post.';
  if (type === 'comment.reaction') return 'reacted to your comment.';
  return 'commented on your post.';
}

function formatNotificationDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
