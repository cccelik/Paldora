import {
  acceptInvitationAction,
  declineInvitationAction,
} from '@/actions/boxes';
import styles from '@/components/boxes/box-lists.module.css';
import { PersonList, PersonRow } from '@/components/common/person-row';
import { RowActionForm } from '@/components/forms/row-action-form';
import { BoxCard, EmptyState } from '@/components/ui';
import { type BoxInvitationView, type BoxView } from '@paldora/validation';
const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

const DOTS = ['ember', 'brass', 'sage'] as const;

/** A stable decorative colour per Box, from its id. */
function dotFor(id: string) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return DOTS[sum % DOTS.length] ?? 'ember';
}

export function BoxCardList({ boxes }: { boxes: readonly BoxView[] }) {
  if (boxes.length === 0) {
    return (
      <EmptyState>You’re not in any Boxes yet. Create one below.</EmptyState>
    );
  }
  return (
    <ul className={styles.cards} aria-label="Your Boxes">
      {boxes.map((box) => (
        <li key={box.id}>
          <BoxCard
            href={`/boxes/${box.id}`}
            name={box.name}
            dot={dotFor(box.id)}
            meta={`${box.memberCount} ${box.memberCount === 1 ? 'member' : 'members'} · ${roleLabel[box.currentUserRole]}${box.status === 'archived' ? ' · Archived' : ''}`}
            cover={
              <span className={styles.coverInitial} aria-hidden="true">
                {Array.from(box.name)[0]?.toUpperCase()}
              </span>
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function MyInvitationList({
  items,
}: {
  items: readonly BoxInvitationView[];
}) {
  return (
    <PersonList label="Box invitations">
      {items.map((invitation) => (
        <PersonRow
          key={invitation.id}
          person={invitation.inviter}
          note={
            <span>
              invited you to <strong>{invitation.box.name}</strong>
            </span>
          }
        >
          <RowActionForm
            action={acceptInvitationAction}
            fields={{ invitationId: invitation.id }}
            label="Join"
            pendingLabel="Joining…"
            variant="primary"
          />
          <RowActionForm
            action={declineInvitationAction}
            fields={{ invitationId: invitation.id }}
            label="Decline"
            pendingLabel="Declining…"
          />
        </PersonRow>
      ))}
    </PersonList>
  );
}
