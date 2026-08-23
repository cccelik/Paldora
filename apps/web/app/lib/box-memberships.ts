import type { BoxMember, BoxRole, UserId } from '@paldora/domain';

export interface BoxMemberPermissions {
  canLeave: boolean;
  canRemove: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canAddFriend: boolean;
  canTransferOwnership: boolean;
}

// The explicit boolean matrix is security-sensitive and intentionally mirrors
// each permission instead of hiding role rules behind mutable configuration.
export function boxMemberPermissions(
  actorUserId: UserId,
  actorRole: BoxRole,
  member: Pick<BoxMember, 'role' | 'userId'>,
  hasSocialConnection = false,
): BoxMemberPermissions {
  const isSelf = actorUserId === member.userId;
  return {
    canLeave: canLeave(isSelf, member.role),
    canRemove: canRemove(isSelf, actorRole, member.role),
    canPromote: canPromote(isSelf, actorRole, member.role),
    canDemote: canDemote(isSelf, actorRole, member.role),
    canAddFriend: !isSelf && !hasSocialConnection,
    canTransferOwnership: canTransferOwnership(isSelf, actorRole, member.role),
  };
}

function canLeave(isSelf: boolean, memberRole: BoxRole): boolean {
  return isSelf && memberRole !== 'owner';
}

function canRemove(
  isSelf: boolean,
  actorRole: BoxRole,
  memberRole: BoxRole,
): boolean {
  return !isSelf && memberRole !== 'owner' && actorRole !== 'member';
}

function canPromote(
  isSelf: boolean,
  actorRole: BoxRole,
  memberRole: BoxRole,
): boolean {
  return !isSelf && memberRole === 'member' && actorRole !== 'member';
}

function canDemote(
  isSelf: boolean,
  actorRole: BoxRole,
  memberRole: BoxRole,
): boolean {
  return !isSelf && memberRole === 'admin' && actorRole === 'owner';
}

function canTransferOwnership(
  isSelf: boolean,
  actorRole: BoxRole,
  memberRole: BoxRole,
): boolean {
  return !isSelf && memberRole !== 'owner' && actorRole === 'owner';
}
