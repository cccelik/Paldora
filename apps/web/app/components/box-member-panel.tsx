import type { BoxId, BoxMember, BoxRole, UserId } from '@paldora/domain';
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
        {members.map((member) => {
          const permissions = boxMemberPermissions(
            currentUserId,
            currentUserRole,
            member,
            socialConnections.has(member.userId),
          );
          const hasActions = Object.values(permissions).some(Boolean);
          return (
            <div className="member-row" key={member.userId}>
              <InitialAvatar
                name={member.displayName}
                imageUrl={member.avatarUrl}
              />
              <div className="member-row-copy">
                <strong>{member.displayName}</strong>
                <div className="member-identity-line">
                  <small className="member-username">@{member.username}</small>
                  <span className="member-role">{member.role}</span>
                  {hasActions && (
                    <OverflowMenu label={`Manage ${member.displayName}`}>
                      {permissions.canAddFriend && (
                        <form
                          action={sendFriendRequestFromBoxAction.bind(
                            null,
                            boxId,
                          )}
                        >
                          <input
                            type="hidden"
                            name="username"
                            value={member.username}
                          />
                          <PendingSubmitButton pendingChildren="Request sent">
                            Add friend
                          </PendingSubmitButton>
                        </form>
                      )}
                      {permissions.canPromote && (
                        <form
                          action={updateBoxMemberRoleAction.bind(
                            null,
                            boxId,
                            member.userId,
                            'admin',
                          )}
                        >
                          <button type="submit">Make admin</button>
                        </form>
                      )}
                      {permissions.canDemote && (
                        <form
                          action={updateBoxMemberRoleAction.bind(
                            null,
                            boxId,
                            member.userId,
                            'member',
                          )}
                        >
                          <button type="submit">Remove admin</button>
                        </form>
                      )}
                      {permissions.canTransferOwnership && (
                        <form
                          action={transferBoxOwnershipAction.bind(
                            null,
                            boxId,
                            member.userId,
                          )}
                        >
                          <ConfirmSubmitButton
                            confirmation={`Transfer this Box to ${member.displayName}? You will become an admin and they will become the owner.`}
                          >
                            Transfer ownership
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      {permissions.canRemove && (
                        <form
                          action={removeBoxMemberAction.bind(
                            null,
                            boxId,
                            member.userId,
                          )}
                        >
                          <ConfirmSubmitButton
                            className="danger"
                            confirmation={`Remove ${member.displayName} from this Box? They will immediately lose access.`}
                          >
                            Remove
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      {permissions.canLeave && (
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
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {currentUserRole === 'owner' && (
        <p className="owner-membership-note">
          Transfer ownership to another member before leaving this Box.
        </p>
      )}
    </SurfaceCard>
  );
}
