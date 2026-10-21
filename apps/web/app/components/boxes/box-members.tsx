import {
  removeMemberAction,
  revokeInvitationAction,
  setMemberRoleAction,
  transferOwnershipAction,
} from '@/actions/boxes';
import { PersonList, PersonRow } from '@/components/common/person-row';
import { ConfirmAction } from '@/components/forms/confirm-action';
import { RowActionForm } from '@/components/forms/row-action-form';
import { Badge, EmptyState } from '@/components/ui';
import { mayChangeRole, mayRemoveMember, type BoxRole } from '@paldora/domain';
import {
  type BoxInvitationView,
  type BoxMemberView,
} from '@paldora/validation';
const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

function MemberActions({
  boxId,
  viewerRole,
  member,
}: {
  boxId: string;
  viewerRole: BoxRole;
  member: BoxMemberView;
}) {
  const next = member.role === 'member' ? 'admin' : 'member';
  const fields = { boxId, userId: member.user.id };
  const name = member.user.displayName;
  return (
    <>
      {mayChangeRole({ actor: viewerRole, target: member.role, next }) ? (
        <RowActionForm
          action={setMemberRoleAction}
          fields={{ ...fields, role: next }}
          label={next === 'admin' ? 'Make admin' : 'Make member'}
          pendingLabel="Saving…"
        />
      ) : null}
      {viewerRole === 'owner' ? (
        <ConfirmAction
          action={transferOwnershipAction}
          fields={fields}
          label="Make owner"
          prompt={`Make ${name} the owner? You’ll become an admin.`}
          confirmLabel="Yes, transfer"
          pendingLabel="Transferring…"
          variant="secondary"
        />
      ) : null}
      {mayRemoveMember(viewerRole, member.role) ? (
        <ConfirmAction
          action={removeMemberAction}
          fields={fields}
          label="Remove"
          prompt={`Remove ${name} from this Box?`}
          confirmLabel="Yes, remove"
          pendingLabel="Removing…"
        />
      ) : null}
    </>
  );
}

/**
 * The buttons shown here only mirror the rules in `@paldora/domain`; the API
 * re-checks every action against the locked membership rows.
 */
export function MemberList({
  boxId,
  viewerId,
  viewerRole,
  members,
}: {
  boxId: string;
  viewerId: string;
  viewerRole: BoxRole;
  members: readonly BoxMemberView[];
}) {
  return (
    <PersonList label="Members">
      {members.map((member) => (
        <PersonRow
          key={member.user.id}
          person={member.user}
          room
          note={
            <>
              <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>
                {roleLabel[member.role]}
              </Badge>
              {member.user.id === viewerId ? <Badge>You</Badge> : null}
            </>
          }
        >
          {member.user.id === viewerId ? null : (
            <MemberActions
              boxId={boxId}
              viewerRole={viewerRole}
              member={member}
            />
          )}
        </PersonRow>
      ))}
    </PersonList>
  );
}

export function PendingInvitationList({
  boxId,
  items,
}: {
  boxId: string;
  items: readonly BoxInvitationView[];
}) {
  if (items.length === 0) {
    return <EmptyState>No invitations waiting.</EmptyState>;
  }
  return (
    <PersonList label="Pending invitations">
      {items.map((invitation) => (
        <PersonRow
          key={invitation.id}
          person={invitation.invitee}
          note={<Badge>Invited</Badge>}
        >
          <RowActionForm
            action={revokeInvitationAction}
            fields={{ boxId, invitationId: invitation.id }}
            label="Withdraw"
            pendingLabel="Withdrawing…"
          />
        </PersonRow>
      ))}
    </PersonList>
  );
}
