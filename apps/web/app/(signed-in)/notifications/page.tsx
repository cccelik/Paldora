import { markAllNotificationsReadAction } from '@/actions/notifications';
import { MoreLink } from '@/components/common/more-link';
import { RowActionForm } from '@/components/forms/row-action-form';
import { NotificationList } from '@/components/notifications/notification-row';
import { FriendRequestList } from '@/components/people/friend-lists';
import { EmptyState, PageColumns, PageHeader, Section } from '@/components/ui';
import { completedUser, cursorParam } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
export const metadata = { title: 'Activity' };

/** Figma W09: what happened, newest first, with waiting friend requests beside it. */
export default async function NotificationsPage({
  searchParams,
}: PageProps<'/notifications'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const data = await firebaseWebData();
  const [page, requests] = await Promise.all([
    data.notifications({ limit: 20, cursor }),
    data.friendRequests({ limit: 50 }),
  ]);
  const unread = page.unreadCount.count;
  const incoming = requests.items.filter(
    (request) => request.direction === 'incoming',
  );
  return (
    <PageColumns
      railLabel="Friend requests"
      rail={
        incoming.length > 0 ? (
          <Section id="activity-requests" title="Friend requests">
            <FriendRequestList items={incoming.slice(0, 3)} />
          </Section>
        ) : undefined
      }
    >
      <PageHeader
        eyebrow={
          unread === 0
            ? 'All caught up'
            : `${page.unreadCount.capped ? '99+' : unread} new`
        }
        title="Activity"
        description="Comments and reactions on what you share, newest first."
        action={
          unread > 0 ? (
            <RowActionForm
              action={markAllNotificationsReadAction}
              fields={{}}
              label="Mark all read"
              pendingLabel="Marking…"
            />
          ) : undefined
        }
      />
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
    </PageColumns>
  );
}
