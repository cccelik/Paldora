import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  blockUserAction,
  respondToFriendRequestAction,
  sendFriendRequestAction,
  unblockUserAction,
} from '../actions/social';
import { AppShell } from '../components/app-shell';
import { authenticatedApiClient, loadCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete')
    redirect(`/onboarding/${current.profile.onboardingState}`);
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
      <header className="app-page-header">
        <div>
          <p className="eyebrow">Your people</p>
          <h1>Friends</h1>
          <p>Friendship is mutual. Both people must choose it.</p>
        </div>
      </header>
      {notices.error && (
        <p className="form-message error page-notice" role="alert">
          {notices.error}
        </p>
      )}
      {notices.notice && (
        <p className="form-message success page-notice" role="status">
          {notices.notice}
        </p>
      )}
      <div className="friends-layout">
        <div>
          {incoming.length > 0 && (
            <section className="social-section first-section">
              <div className="section-heading">
                <h2>Requests for you</h2>
                <span>{incoming.length}</span>
              </div>
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
            <div className="section-heading">
              <h2>Your friends</h2>
              <span>{friends.length}</span>
            </div>
            {friends.length ? (
              <div className="social-list">
                {friends.map((friend) => (
                  <PersonRow
                    key={friend.id}
                    name={
                      friend.user.displayName ??
                      friend.user.username ??
                      'Paldora friend'
                    }
                    username={friend.user.username ?? ''}
                    detail="Accepted friend"
                  />
                ))}
              </div>
            ) : (
              <div className="list-empty">
                <strong>No friends here yet.</strong>
                <span>Send a request using their exact username.</span>
              </div>
            )}
          </section>
          {(outgoing.length > 0 || blocked.length > 0) && (
            <section className="social-section">
              <div className="section-heading">
                <h2>Other connections</h2>
              </div>
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
        <aside className="settings-card friend-add-card">
          <p className="eyebrow">Add someone</p>
          <h2>Find by username</h2>
          <p>
            There is no public people directory. Enter the username they shared
            with you.
          </p>
          <form className="form-stack" action={sendFriendRequestAction}>
            <label>
              Username
              <input
                name="username"
                required
                minLength={3}
                maxLength={30}
                placeholder="close_friend"
              />
            </label>
            <button className="button-primary full-width" type="submit">
              Send friend request
            </button>
          </form>
          <details className="block-controls">
            <summary>Block a username</summary>
            <form className="form-stack" action={blockUserAction}>
              <label>
                Username to block
                <input name="username" required minLength={3} maxLength={30} />
              </label>
              <button className="button-secondary full-width" type="submit">
                Block user
              </button>
            </form>
          </details>
        </aside>
      </div>
    </AppShell>
  );
}

function PersonRow({
  name,
  username,
  detail = 'Friend request',
  actions,
}: {
  name: string;
  username: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <article className="social-row">
      <div className="member-avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="social-row-copy">
        <strong>{name}</strong>
        <span>
          @{username} · {detail}
        </span>
      </div>
      {actions && <div className="row-actions">{actions}</div>}
    </article>
  );
}
