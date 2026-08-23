import Link from 'next/link';
import { redirect } from 'next/navigation';
import { respondToBoxInvitationAction } from '../actions/social';
import { AppShell } from '../components/app-shell';
import { authenticatedApiClient, loadCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function BoxesPage() {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete')
    redirect(`/onboarding/${current.profile.onboardingState}`);
  const api = await authenticatedApiClient();
  const [boxes, invitations] = await Promise.all([
    api.boxes(),
    api.boxInvitations(),
  ]);
  return (
    <AppShell current={current} active="boxes">
      <header className="app-page-header social-heading">
        <div>
          <p className="eyebrow">Private circles</p>
          <h1>Boxes</h1>
          <p>Small spaces shared only with the people you choose.</p>
        </div>
        <Link className="button-primary inline-button" href="/boxes/new">
          Create a Box
        </Link>
      </header>

      {invitations.length > 0 && (
        <section className="social-section">
          <div className="section-heading">
            <h2>Invitations</h2>
            <span>{invitations.length}</span>
          </div>
          <div className="social-list">
            {invitations.map((invitation) => (
              <article className="social-row" key={invitation.id}>
                <div className="box-glyph" aria-hidden="true">
                  ◇
                </div>
                <div className="social-row-copy">
                  <strong>{invitation.boxName}</strong>
                  <span>Private Box · invitation expires in 7 days</span>
                </div>
                <div className="row-actions">
                  <form
                    action={respondToBoxInvitationAction.bind(
                      null,
                      invitation.id,
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
                    action={respondToBoxInvitationAction.bind(
                      null,
                      invitation.id,
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
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {boxes.length ? (
        <section className="box-grid" aria-label="Your Boxes">
          {boxes.map((box) => (
            <Link className="box-card" href={`/boxes/${box.id}`} key={box.id}>
              <div className="box-card-art" aria-hidden="true">
                ◇
              </div>
              <p className="eyebrow">{box.currentUserRole}</p>
              <h2>{box.name}</h2>
              <p>
                {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'}
              </p>
              <span>Open Box →</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="empty-home compact-empty">
          <div className="empty-box-art" aria-hidden="true">
            <span>✦</span>
            <div>◇</div>
          </div>
          <p className="eyebrow">Your first circle</p>
          <h2>Create a place for your people.</h2>
          <p>
            A Box is private by default. Invite accepted friends when you are
            ready.
          </p>
          <Link className="button-primary inline-button" href="/boxes/new">
            Create your first Box
          </Link>
        </section>
      )}
    </AppShell>
  );
}
