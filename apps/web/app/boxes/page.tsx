import Link from 'next/link';
import { respondToBoxInvitationAction } from '../actions/social';
import { AppShell } from '../components/app-shell';
import {
  EmptyState,
  PageHeader,
  SectionHeading,
  SocialRow,
} from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function BoxesPage() {
  const current = await loadCompletedCurrentUser();
  const api = await authenticatedApiClient();
  const [boxes, invitations] = await Promise.all([
    api.boxes(),
    api.boxInvitations(),
  ]);
  return (
    <AppShell current={current} active="boxes">
      <PageHeader
        className="social-heading"
        eyebrow="Private circles"
        title="Boxes"
        description="Small spaces shared only with the people you choose."
        trailing={
          <Link className="button-primary inline-button" href="/boxes/new">
            Create a Box
          </Link>
        }
      />

      {invitations.length > 0 && (
        <section className="social-section">
          <SectionHeading title="Invitations" count={invitations.length} />
          <div className="social-list">
            {invitations.map((invitation) => (
              <SocialRow
                key={invitation.id}
                title={invitation.boxName}
                detail="Private Box · invitation expires in 7 days"
                leading={
                  <div className="box-glyph" aria-hidden="true">
                    ◇
                  </div>
                }
                actions={
                  <>
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
                  </>
                }
              />
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
              <p className="eyebrow">
                {box.currentUserRole} · {box.status}
              </p>
              <h2>{box.name}</h2>
              <p>
                {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'}
              </p>
              <span>Open Box →</span>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState
          className="compact-empty"
          eyebrow="Your first circle"
          title="Create a place for your people."
          description="A Box is private by default. Invite friends or any provisioned user by username when you are ready."
          symbol="◇"
          actions={
            <Link className="button-primary inline-button" href="/boxes/new">
              Create your first Box
            </Link>
          }
        />
      )}
    </AppShell>
  );
}
