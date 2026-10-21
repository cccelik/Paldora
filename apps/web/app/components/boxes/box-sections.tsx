import {
  inviteToBoxAction,
  leaveBoxAction,
  setBoxStatusAction,
} from '@/actions/boxes';
import { DeleteBoxForm, RenameBoxForm } from '@/components/boxes/box-forms';
import { PendingInvitationList } from '@/components/boxes/box-members';
import { ConfirmAction } from '@/components/forms/confirm-action';
import { RowActionForm } from '@/components/forms/row-action-form';
import { UsernameActionForm } from '@/components/forms/username-action-form';
import { EmptyState, Section } from '@/components/ui';
import { type BoxInvitationView, type BoxView } from '@paldora/validation';
/** Owners and admins: invite by username and see who is still pending. */
export function InviteSection({
  box,
  invitations,
}: {
  box: BoxView;
  invitations: readonly BoxInvitationView[];
}) {
  return (
    <Section
      id="invite"
      title="Invite people"
      description="Invite anyone by username. They don’t need to be your friend, and invitations expire after 7 days."
    >
      {box.status === 'archived' ? (
        <EmptyState>Restore this Box to invite people.</EmptyState>
      ) : (
        <UsernameActionForm
          action={inviteToBoxAction}
          fields={{ boxId: box.id }}
          id="invite-username"
          label="Their username"
          submitLabel="Send invitation"
          pendingLabel="Sending…"
        />
      )}
      <PendingInvitationList boxId={box.id} items={invitations} />
    </Section>
  );
}

/** The owner's rename and archive controls. */
export function SettingsSection({ box }: { box: BoxView }) {
  const archived = box.status === 'archived';
  return (
    <Section id="settings" title="Settings">
      <RenameBoxForm boxId={box.id} name={box.name} />
      <RowActionForm
        action={setBoxStatusAction}
        fields={{ boxId: box.id, status: archived ? 'active' : 'archived' }}
        label={archived ? 'Restore this Box' : 'Archive this Box'}
        pendingLabel="Saving…"
      />
    </Section>
  );
}

/** Everyone can leave except the owner, who must hand the Box over first. */
export function LeaveSection({ box }: { box: BoxView }) {
  return (
    <Section id="leave" title="Leave">
      {box.currentUserRole === 'owner' ? (
        <EmptyState>
          You own this Box. To leave, make another member the owner first.
        </EmptyState>
      ) : (
        <ConfirmAction
          action={leaveBoxAction}
          fields={{ boxId: box.id }}
          label="Leave this Box"
          prompt="Leave this Box? You’ll need a new invitation to come back."
          confirmLabel="Yes, leave"
          pendingLabel="Leaving…"
        />
      )}
    </Section>
  );
}

export function DeleteSection({ box }: { box: BoxView }) {
  return (
    <Section
      id="delete"
      title="Delete this Box"
      description="Permanently removes the Box for everyone."
    >
      <DeleteBoxForm boxId={box.id} name={box.name} />
    </Section>
  );
}
