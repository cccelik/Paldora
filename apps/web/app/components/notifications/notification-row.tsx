import { openNotificationAction } from '@/actions/notifications';
import { LocalTime } from '@/components/common/local-time';
import styles from '@/components/notifications/notification-row.module.css';
import {
  Avatar,
  HiddenFields,
  NotificationRow as NotificationRowView,
} from '@/components/ui';
import { notificationSentence } from '@/lib/notifications/notification-text';
import { type NotificationView } from '@paldora/validation';
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
        <NotificationRowView
          as="submit"
          unread={!notification.read}
          avatar={
            <Avatar
              url={notification.actor.avatarUrl}
              name={notification.actor.displayName}
            />
          }
          time={<LocalTime iso={notification.createdAt} />}
          thumbnail={
            notification.reaction?.thumbnailUrl ? (
              <img
                className={styles.thumbnail}
                src={notification.reaction.thumbnailUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : undefined
          }
        >
          {sentence}
        </NotificationRowView>
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
