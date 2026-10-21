import { type NotificationView } from '@paldora/validation';
import { openNotificationAction } from '../actions/notifications';
import { notificationSentence } from '../lib/notification-text';
import { LocalTime } from './local-time';
import styles from './notification-row.module.css';
import { Avatar, HiddenFields } from './ui';
/**
 * One notification. The whole row is a form button: it marks the
 * notification read and opens what it is about, with or without JavaScript.
 */
export function NotificationRow({
  notification,
}: {
  notification: NotificationView;
}) {
  const sentence = notificationSentence(notification);
  return (
    <li className={styles.item}>
      <form action={openNotificationAction} className={styles.form}>
        <HiddenFields values={{ notificationId: notification.id }} />
        <HiddenFields values={{ postId: notification.postId }} />
        <HiddenFields
          values={{ lifeUpdateId: notification.lifeUpdateId ?? '' }}
        />
        <HiddenFields values={{ boxId: notification.box.id }} />
        <HiddenFields values={{ commentId: notification.commentId ?? '' }} />
        <button
          type="submit"
          className={styles.row}
          data-read={notification.read ? 'true' : 'false'}
        >
          <Avatar
            url={notification.actor.avatarUrl}
            name={notification.actor.displayName}
          />
          <span className={styles.text}>
            <span className={styles.sentence}>{sentence}</span>
            <span className={styles.time}>
              <LocalTime iso={notification.createdAt} />
            </span>
          </span>
          {notification.reaction?.thumbnailUrl ? (
            <img
              className={styles.thumbnail}
              src={notification.reaction.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : null}
          {notification.read ? null : (
            <span className={styles.unread}>
              <span className={styles.dot} aria-hidden="true" />
              <span className="visually-hidden">Unread</span>
            </span>
          )}
        </button>
      </form>
    </li>
  );
}

export function NotificationList({
  items,
}: {
  items: readonly NotificationView[];
}) {
  return (
    <ul className={styles.list} aria-label="Notifications">
      {items.map((notification) => (
        <NotificationRow key={notification.id} notification={notification} />
      ))}
    </ul>
  );
}
