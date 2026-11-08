import styles from '@/components/ui/notification-row.module.css';
import { type ReactNode } from 'react';
/**
 * Figma "Notification row" (44:140): an ember dot while unread. The row is a
 * button (`as="submit"` inside a form, `as="button"` with a handler) or a
 * plain block. Unread is also spoken, never colour alone.
 */
export function NotificationRow({
  avatar,
  time,
  unread = false,
  thumbnail,
  as = 'block',
  children,
}: {
  avatar: ReactNode;
  time: ReactNode;
  unread?: boolean;
  thumbnail?: ReactNode;
  as?: 'block' | 'button' | 'submit';
  /** The sentence. */
  children: ReactNode;
}) {
  const inner = (
    <>
      {avatar}
      <span className={styles.text}>
        <span className={styles.sentence}>{children}</span>
        <span className={styles.time}>{time}</span>
      </span>
      {thumbnail}
      {unread ? (
        <span className={styles.unread}>
          <span className={styles.dot} aria-hidden="true" />
          <span className="visually-hidden">Unread</span>
        </span>
      ) : null}
    </>
  );
  const common = {
    className: styles.row,
    'data-read': unread ? 'false' : 'true',
  };
  return as === 'block' ? (
    <div {...common}>{inner}</div>
  ) : (
    <button type={as === 'submit' ? 'submit' : 'button'} {...common}>
      {inner}
    </button>
  );
}
