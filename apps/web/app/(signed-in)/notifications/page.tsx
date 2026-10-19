import { markAllNotificationsReadAction } from '../../actions/notifications';
import { MoreLink } from '../../components/more-link';
import { NotificationList } from '../../components/notification-row';
import { RowActionForm } from '../../components/row-action-form';
import { EmptyState, PageHeader } from '../../components/ui';
import { apiClient, completedUser, cursorParam } from '../../lib/session';
import styles from '../page-stack.module.css';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({
  searchParams,
}: PageProps<'/notifications'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const page = await (await apiClient()).notifications({ limit: 20, cursor });
  const unread = page.unreadCount.count;
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Notifications"
        description={
          unread === 0
            ? 'You’re all caught up.'
            : `${page.unreadCount.capped ? '99+' : unread} unread.`
        }
      />
      {unread > 0 ? (
        <RowActionForm
          action={markAllNotificationsReadAction}
          fields={{}}
          label="Mark all read"
          pendingLabel="Marking…"
        />
      ) : null}
      {page.items.length === 0 ? (
        <EmptyState>
          Nothing yet. When someone comments on or reacts to what you share, it
          shows up here.
        </EmptyState>
      ) : (
        <NotificationList items={page.items} />
      )}
      {page.nextCursor ? (
        <MoreLink
          href={`/notifications?cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show older notifications"
        />
      ) : null}
    </div>
  );
}
