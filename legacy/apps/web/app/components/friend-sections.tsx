import type { Friendship } from '@paldora/domain';
import {
  blockUserAction,
  removeFriendAction,
  respondToFriendRequestAction,
  sendFriendRequestAction,
  unblockUserAction,
} from '../actions/social';
import { roomPath } from '../lib/room-paths';
import { ConfirmSubmitButton } from './confirm-submit-button';
import {
  ListEmpty,
  PersonRow,
  SectionHeading,
  SurfaceCard,
  UsernameField,
} from './ui';

export function IncomingFriendRequests({
  requests,
}: {
  requests: readonly Friendship[];
}) {
  if (requests.length === 0) return null;
  return (
    <section className="social-section first-section">
      <SectionHeading title="Requests for you" count={requests.length} />
      <div className="social-list">
        {requests.map((request) => (
          <PersonRow
            key={request.id}
            {...personIdentity(request)}
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
                  <button className="button-quiet compact-button" type="submit">
                    Decline
                  </button>
                </form>
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}

export function FriendsList({ friends }: { friends: readonly Friendship[] }) {
  return (
    <section className="social-section first-section">
      <SectionHeading title="Your friends" count={friends.length} />
      {friends.length ? (
        <div className="social-list">
          {friends.map((friend) => {
            const identity = personIdentity(friend);
            return (
              <PersonRow
                key={friend.id}
                {...identity}
                detail="Accepted friend"
                actions={
                  <form action={removeFriendAction.bind(null, friend.user.id)}>
                    <ConfirmSubmitButton
                      className="button-quiet danger compact-button"
                      confirmation={`Remove ${identity.name} from your friends? Existing shared Box memberships will not change.`}
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
  );
}

export function OtherConnections({
  outgoing,
  blocked,
}: {
  outgoing: readonly Friendship[];
  blocked: readonly Friendship[];
}) {
  if (outgoing.length === 0 && blocked.length === 0) return null;
  return (
    <section className="social-section">
      <SectionHeading title="Other connections" />
      <div className="social-list">
        {outgoing.map((request) => (
          <PersonRow
            key={request.id}
            {...personIdentity(request)}
            detail="Request pending"
          />
        ))}
        {blocked.map((item) => (
          <PersonRow
            key={item.id}
            {...personIdentity(item)}
            detail="Blocked"
            actions={
              <form action={unblockUserAction.bind(null, item.user.id)}>
                <button className="button-quiet compact-button" type="submit">
                  Unblock
                </button>
              </form>
            }
          />
        ))}
      </div>
    </section>
  );
}

export function FriendControls() {
  return (
    <SurfaceCard as="aside" className="friend-add-card">
      <p className="eyebrow">Add someone</p>
      <h2>Find by username</h2>
      <p>
        There is no public people directory. Enter the username they shared with
        you.
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
  );
}

function personIdentity(friendship: Friendship) {
  return {
    name:
      friendship.user.displayName ??
      friendship.user.username ??
      'Paldora friend',
    username: friendship.user.username ?? '',
    avatarUrl: friendship.user.avatarUrl,
    href: roomPath(friendship.user.username ?? ''),
  };
}
