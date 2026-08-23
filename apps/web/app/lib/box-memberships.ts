import type { BoxMember, BoxRole, UserId } from '@paldora/domain';

export interface BoxMemberPermissions {
  canLeave: boolean;
  canRemove: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canAddFriend: boolean;
  canTransferOwnership: boolean;
}

export function boxMemberPermissions(
  actorUserId: UserId,
  actorRole: BoxRole,
  member: Pick<BoxMember, 'role' | 'userId'>,
  hasSocialConnection = false,
): BoxMemberPermissions {
  const isSelf = actorUserId === member.userId;
  const targetIsOwner = member.role === 'owner';
  return {
    canLeave: isSelf && !targetIsOwner,
    canRemove:
      !isSelf &&
      !targetIsOwner &&
      (actorRole === 'owner' || actorRole === 'admin'),
    canPromote:
      !isSelf &&
      member.role === 'member' &&
      (actorRole === 'owner' || actorRole === 'admin'),
    canDemote: !isSelf && member.role === 'admin' && actorRole === 'owner',
    canAddFriend: !isSelf && !hasSocialConnection,
    canTransferOwnership: !isSelf && !targetIsOwner && actorRole === 'owner',
  };
}
