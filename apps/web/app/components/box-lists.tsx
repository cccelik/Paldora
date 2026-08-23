import type { Box, BoxInvitation } from '@paldora/domain';
import Link from 'next/link';
import { respondToBoxInvitationAction } from '../actions/social';
import { EmptyState, SectionHeading, SocialRow } from './ui';

export function BoxInvitationList({
  invitations,
}: {
  invitations: readonly BoxInvitation[];
}) {
  if (invitations.length === 0) return null;
  return (
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
            actions={<InvitationActions invitation={invitation} />}
          />
        ))}
      </div>
    </section>
  );
}

export function BoxGrid({ boxes }: { boxes: readonly Box[] }) {
  if (boxes.length === 0) {
    return (
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
    );
  }
  return (
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
  );
}

function InvitationActions({ invitation }: { invitation: BoxInvitation }) {
  return (
    <>
      {(['accept', 'decline'] as const).map((response) => (
        <form
          key={response}
          action={respondToBoxInvitationAction.bind(
            null,
            invitation.id,
            response,
          )}
        >
          <button
            className={
              response === 'accept'
                ? 'button-primary compact-button'
                : 'button-quiet compact-button'
            }
            type="submit"
          >
            {response === 'accept' ? 'Accept' : 'Decline'}
          </button>
        </form>
      ))}
    </>
  );
}
