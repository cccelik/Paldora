import type { BoxId } from '@paldora/domain';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { inviteToBoxAction } from '../../actions/social';
import { AppShell } from '../../components/app-shell';
import { authenticatedApiClient, loadCurrentUser } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function BoxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ boxId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete')
    redirect(`/onboarding/${current.profile.onboardingState}`);
  const { boxId } = await params;
  const notices = await searchParams;
  const api = await authenticatedApiClient();
  let box;
  let members;
  try {
    [box, members] = await Promise.all([
      api.box(boxId as BoxId),
      api.boxMembers(boxId as BoxId),
    ]);
  } catch {
    notFound();
  }
  const canInvite =
    box.currentUserRole === 'owner' || box.currentUserRole === 'admin';
  return (
    <AppShell current={current} active="boxes">
      <header className="app-page-header social-heading">
        <div>
          <p className="eyebrow">Private Box · {box.currentUserRole}</p>
          <h1>{box.name}</h1>
          <p>
            {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'} ·
            only members can see this space
          </p>
        </div>
        <Link className="button-quiet" href="/boxes">
          All Boxes
        </Link>
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
      <div className="box-detail-layout">
        <section className="empty-home box-feed-empty">
          <div className="empty-box-art" aria-hidden="true">
            <span>✦</span>
            <div>□</div>
          </div>
          <p className="eyebrow">The Box is ready</p>
          <h2>Stories come in the next phase.</h2>
          <p>
            Membership and privacy are live. Posts are intentionally not
            simulated until the feed milestone.
          </p>
        </section>
        <aside className="settings-side">
          {canInvite && (
            <section className="settings-card">
              <h2>Invite a friend</h2>
              <form
                className="form-stack"
                action={inviteToBoxAction.bind(null, box.id)}
              >
                <label>
                  Username
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="their_username"
                  />
                  <small>They must already be an accepted friend.</small>
                </label>
                <button className="button-primary full-width" type="submit">
                  Send invitation
                </button>
              </form>
            </section>
          )}
          <section className="settings-card">
            <h2>Members</h2>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.userId}>
                  <span className="member-avatar" aria-hidden="true">
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.displayName}</strong>
                    <small>
                      @{member.username} · {member.role}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
