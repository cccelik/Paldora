import { AppShell } from '../components/app-shell';
import {
  FriendControls,
  FriendsList,
  IncomingFriendRequests,
  OtherConnections,
} from '../components/friend-sections';
import { PageFeedback, PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    warning?: string;
    notice?: string;
  }>;
}) {
  const current = await loadCompletedCurrentUser();
  const notices = await searchParams;
  const api = await authenticatedApiClient();
  const [friends, requests, blocked] = await Promise.all([
    api.friends(),
    api.friendRequests(),
    api.blockedUsers(),
  ]);
  const incoming = requests.filter((item) => item.direction === 'incoming');
  const outgoing = requests.filter((item) => item.direction === 'outgoing');

  return (
    <AppShell current={current} active="friends">
      <PageHeader
        eyebrow="Your people"
        title="Friends"
        description="Friendship is mutual. Both people must choose it."
      />
      <PageFeedback
        error={notices.error}
        warning={notices.warning}
        notice={notices.notice}
      />
      <div className="friends-layout">
        <div>
          <IncomingFriendRequests requests={incoming} />
          <FriendsList friends={friends} />
          <OtherConnections outgoing={outgoing} blocked={blocked} />
        </div>
        <FriendControls />
      </div>
    </AppShell>
  );
}
