import type { BoxId, BoxMember, BoxRole, UserId } from '@paldora/domain';
import type { ReactNode } from 'react';
import {
  leaveBoxAction,
  removeBoxMemberAction,
  sendFriendRequestFromBoxAction,
  transferBoxOwnershipAction,
  updateBoxMemberRoleAction,
} from '../actions/social';
import { boxMemberPermissions } from '../lib/box-memberships';
import { ConfirmSubmitButton } from './confirm-submit-button';
import { OverflowMenu } from './overflow-menu';
import { PendingSubmitButton } from './pending-submit-button';
import { InitialAvatar, SurfaceCard } from './ui';

export function BoxMemberPanel({
  boxId,
  currentUserId,
  currentUserRole,
  members,
  socialConnectionUserIds = [],
}: {
  boxId: BoxId;
  currentUserId: UserId;
  currentUserRole: BoxRole;
  members: readonly BoxMember[];
  socialConnectionUserIds?: readonly UserId[];
}) {
  const socialConnections = new Set(socialConnectionUserIds);
  return (
    <SurfaceCard title="Members">
      <div className="member-list">
        {members.map((member) => (
          <BoxMemberRow
            key={member.userId}
            boxId={boxId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            member={member}
            hasSocialConnection={socialConnections.has(member.userId)}
          />
        ))}
      </div>
      {currentUserRole === 'owner' && (
        <p className="owner-membership-note">
          Transfer ownership to another member before leaving this Box.
        </p>
      )}
    </SurfaceCard>
  );
}

function BoxMemberRow({
  boxId,
  currentUserId,
  currentUserRole,
  member,
  hasSocialConnection,
}: {
  boxId: BoxId;
  currentUserId: UserId;
  currentUserRole: BoxRole;
  member: BoxMember;
  hasSocialConnection: boolean;
}) {
  const permissions = boxMemberPermissions(
    currentUserId,
    currentUserRole,
    member,
    hasSocialConnection,
  );
  return (
    <div className="member-row">
      <InitialAvatar name={member.displayName} imageUrl={member.avatarUrl} />
      <div className="member-row-copy">
        <strong>{member.displayName}</strong>
        <div className="member-identity-line">
          <small className="member-username">@{member.username}</small>
          <span className="member-role">{member.role}</span>
        </div>
      </div>
      {Object.values(permissions).some(Boolean) && (
        <MemberActions boxId={boxId} member={member} {...permissions} />
      )}
    </div>
  );
}

function MemberActions({
  boxId,
  member,
  canLeave,
  canRemove,
  canPromote,
  canDemote,
  canAddFriend,
  canTransferOwnership,
}: ReturnType<typeof boxMemberPermissions> & {
  boxId: BoxId;
  member: BoxMember;
}) {
  return (
    <OverflowMenu label={`Manage ${member.displayName}`}>
      {canAddFriend && (
        <form action={sendFriendRequestFromBoxAction.bind(null, boxId)}>
          <input type="hidden" name="username" value={member.username} />
          <PendingSubmitButton pendingChildren="Request sent">
            Add friend
          </PendingSubmitButton>
        </form>
      )}
      {canPromote && (
        <RoleForm boxId={boxId} memberUserId={member.userId} role="admin">
          Make admin
        </RoleForm>
      )}
      {canDemote && (
        <RoleForm boxId={boxId} memberUserId={member.userId} role="member">
          Remove admin
        </RoleForm>
      )}
      {canTransferOwnership && (
        <form
          action={transferBoxOwnershipAction.bind(null, boxId, member.userId)}
        >
          <ConfirmSubmitButton
            confirmation={`Transfer this Box to ${member.displayName}? You will become an admin and they will become the owner.`}
          >
            Transfer ownership
          </ConfirmSubmitButton>
        </form>
      )}
      {canRemove && (
        <form action={removeBoxMemberAction.bind(null, boxId, member.userId)}>
          <ConfirmSubmitButton
            className="danger"
            confirmation={`Remove ${member.displayName} from this Box? They will immediately lose access.`}
          >
            Remove
          </ConfirmSubmitButton>
        </form>
      )}
      {canLeave && (
        <form action={leaveBoxAction.bind(null, boxId)}>
          <ConfirmSubmitButton
            className="danger"
            confirmation="Leave this Box? You will lose access and need another invitation to return."
          >
            Leave
          </ConfirmSubmitButton>
        </form>
      )}
    </OverflowMenu>
  );
}

function RoleForm({
  boxId,
  memberUserId,
  role,
  children,
}: {
  boxId: BoxId;
  memberUserId: UserId;
  role: 'admin' | 'member';
  children: ReactNode;
}) {
  return (
    <form
      action={updateBoxMemberRoleAction.bind(null, boxId, memberUserId, role)}
    >
      <button type="submit">{children}</button>
    </form>
  );
}
