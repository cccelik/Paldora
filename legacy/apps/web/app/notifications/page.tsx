import Link from 'next/link';
import type { Route } from 'next';
import { markAllNotificationsReadAction } from '../actions/interactions';
import { AppShell } from '../components/app-shell';
import { NotificationRow } from '../components/notification-row';
import { PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { cursor } = await searchParams;
  const page = await (
    await authenticatedApiClient()
  ).notifications({
    ...(cursor ? { cursor } : {}),
    limit: 20,
  });
  return (
    <AppShell active="notifications" current={current}>
      <PageHeader
        eyebrow="Your private activity"
        title="Notifications"
        description={`${page.unreadCount} unread ${page.unreadCount === 1 ? 'notification' : 'notifications'}`}
        trailing={
          page.unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="button-quiet" type="submit">
                Mark all read
              </button>
            </form>
          ) : undefined
        }
      />
      {page.items.length > 0 ? (
        <section className="notification-list" aria-label="Notifications">
          {page.items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
            />
          ))}
          {page.nextCursor && (
            <Link
              className="button-secondary notification-load-more"
              href={
                `/notifications?cursor=${encodeURIComponent(page.nextCursor)}` as Route
              }
            >
              Load older notifications
            </Link>
          )}
        </section>
      ) : (
        <section className="notification-empty">
          <div aria-hidden="true">♢</div>
          <h2>All quiet for now.</h2>
          <p>
            Comments, replies, and reactions from your Boxes will appear here.
          </p>
        </section>
      )}
    </AppShell>
  );
}
