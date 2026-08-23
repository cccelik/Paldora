import {
  blockUserAction,
  removeFriendAction,
  respondToFriendRequestAction,
  sendFriendRequestAction,
  unblockUserAction,
} from '../actions/social';
import { AppShell } from '../components/app-shell';
import { ConfirmSubmitButton } from '../components/confirm-submit-button';
import {
  ListEmpty,
  PageFeedback,
  PageHeader,
  PersonRow,
  SectionHeading,
  SurfaceCard,
  UsernameField,
} from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
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
      <PageFeedback error={notices.error} notice={notices.notice} />
      <div className="friends-layout">
        <div>
          {incoming.length > 0 && (
            <section className="social-section first-section">
              <SectionHeading
                title="Requests for you"
                count={incoming.length}
              />
              <div className="social-list">
                {incoming.map((request) => (
                  <PersonRow
                    key={request.id}
                    name={
                      request.user.displayName ??
                      request.user.username ??
                      'Paldora friend'
                    }
                    username={request.user.username ?? ''}
                    avatarUrl={request.user.avatarUrl}
                    actions={
                      <>
                        <form
                          action={respondToFriendRequestAction.bind(
                            null,
                            request.id,
                            'accept',
                          )}
                        >
                          <button
                            className="button-primary compact-button"
                            type="submit"
                          >
                            Accept
                          </button>
                        </form>
                        <form
                          action={respondToFriendRequestAction.bind(
                            null,
                            request.id,
                            'decline',
                          )}
                        >
                          <button
                            className="button-quiet compact-button"
                            type="submit"
                          >
                            Decline
                          </button>
                        </form>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}
          <section className="social-section first-section">
            <SectionHeading title="Your friends" count={friends.length} />
            {friends.length ? (
              <div className="social-list">
                {friends.map((friend) => {
                  const name =
                    friend.user.displayName ??
                    friend.user.username ??
                    'Paldora friend';
                  return (
                    <PersonRow
                      key={friend.id}
                      name={name}
                      username={friend.user.username ?? ''}
                      avatarUrl={friend.user.avatarUrl}
                      detail="Accepted friend"
                      actions={
                        <form
                          action={removeFriendAction.bind(null, friend.user.id)}
                        >
                          <ConfirmSubmitButton
                            className="button-quiet danger compact-button"
                            confirmation={`Remove ${name} from your friends? Existing shared Box memberships will not change.`}
                          >
                            Remove
                          </ConfirmSubmitButton>
                        </form>
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <ListEmpty
                title="No friends here yet."
                description="Send a request using their exact username."
              />
            )}
          </section>
          {(outgoing.length > 0 || blocked.length > 0) && (
            <section className="social-section">
              <SectionHeading title="Other connections" />
              <div className="social-list">
                {outgoing.map((request) => (
                  <PersonRow
                    key={request.id}
                    name={
                      request.user.displayName ??
                      request.user.username ??
                      'Paldora friend'
                    }
                    username={request.user.username ?? ''}
                    avatarUrl={request.user.avatarUrl}
                    detail="Request pending"
                  />
                ))}
                {blocked.map((item) => (
                  <PersonRow
                    key={item.id}
                    name={
                      item.user.displayName ??
                      item.user.username ??
                      'Paldora friend'
                    }
                    username={item.user.username ?? ''}
                    avatarUrl={item.user.avatarUrl}
                    detail="Blocked"
                    actions={
                      <form action={unblockUserAction.bind(null, item.user.id)}>
                        <button
                          className="button-quiet compact-button"
                          type="submit"
                        >
                          Unblock
                        </button>
                      </form>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        <SurfaceCard as="aside" className="friend-add-card">
          <p className="eyebrow">Add someone</p>
          <h2>Find by username</h2>
          <p>
            There is no public people directory. Enter the username they shared
            with you.
          </p>
          <form className="form-stack" action={sendFriendRequestAction}>
            <UsernameField required placeholder="close_friend" />
            <button className="button-primary full-width" type="submit">
              Send friend request
            </button>
          </form>
          <details className="block-controls">
            <summary>Block a username</summary>
            <form className="form-stack" action={blockUserAction}>
              <UsernameField label="Username to block" required />
              <button className="button-secondary full-width" type="submit">
                Block user
              </button>
            </form>
          </details>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
