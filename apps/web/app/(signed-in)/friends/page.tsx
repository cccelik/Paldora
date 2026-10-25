import styles from '@/(signed-in)/friends/page.module.css';
import { blockPersonAction, sendFriendRequestAction } from '@/actions/social';
import { MoreLink } from '@/components/common/more-link';
import { UsernameActionForm } from '@/components/forms/username-action-form';
import {
  BlockedList,
  FriendList,
  FriendRequestList,
} from '@/components/people/friend-lists';
import { PageHeader, Section } from '@/components/ui';
import { completedUser, cursorParam } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
export const metadata = { title: 'Friends' };

export default async function FriendsPage({
  searchParams,
}: PageProps<'/friends'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).friends);
  const api = await firebaseWebData();
  const [friends, requests, blocks] = await Promise.all([
    api.friends({ limit: 25, cursor }),
    api.friendRequests({ limit: 50 }),
    api.blocks({ limit: 50 }),
  ]);
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Friends"
        description="The people you know. Friends can find you, and you can invite anyone to a Box by username."
      />
      <Section id="add" title="Add a friend">
        <UsernameActionForm
          action={sendFriendRequestAction}
          id="friend-username"
          label="Their username"
          submitLabel="Send request"
          pendingLabel="Sending…"
        />
      </Section>
      <Section id="requests" title="Requests">
        <FriendRequestList items={requests.items} />
      </Section>
      <Section id="friends" title="Your friends">
        <FriendList items={friends.items} />
        {friends.nextCursor ? (
          <MoreLink
            href={`/friends?friends=${encodeURIComponent(friends.nextCursor)}`}
            label="Show more friends"
          />
        ) : null}
      </Section>
      <Section
        id="blocked"
        title="Blocked people"
        description="Blocking ends a friendship and withdraws requests and invitations between you. They aren’t told."
      >
        <BlockedList items={blocks.items} />
        <UsernameActionForm
          action={blockPersonAction}
          id="block-username"
          label="Block someone by username"
          submitLabel="Block"
          pendingLabel="Blocking…"
        />
      </Section>
    </div>
  );
}
