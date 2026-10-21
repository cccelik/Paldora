import {
  acceptInvitationAction,
  declineInvitationAction,
} from '@/actions/boxes';
import styles from '@/components/boxes/box-lists.module.css';
import { PersonList, PersonRow } from '@/components/common/person-row';
import { RowActionForm } from '@/components/forms/row-action-form';
import { Badge, EmptyState } from '@/components/ui';
import { type BoxInvitationView, type BoxView } from '@paldora/validation';
import Link from 'next/link';
const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export function BoxCardList({ boxes }: { boxes: readonly BoxView[] }) {
  if (boxes.length === 0) {
    return (
      <EmptyState>You’re not in any Boxes yet. Create one below.</EmptyState>
    );
  }
  return (
    <ul className={styles.cards} aria-label="Your Boxes">
      {boxes.map((box) => (
        <li key={box.id} className={styles.card}>
          <Link className={styles.cardLink} href={`/boxes/${box.id}`}>
            {box.name}
          </Link>
          <span className={styles.badges}>
            <Badge
              tone={box.currentUserRole === 'owner' ? 'accent' : 'neutral'}
            >
              {roleLabel[box.currentUserRole]}
            </Badge>
            <Badge>
              {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'}
            </Badge>
            {box.status === 'archived' ? <Badge>Archived</Badge> : null}
          </span>
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
