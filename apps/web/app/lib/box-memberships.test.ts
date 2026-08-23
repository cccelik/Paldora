import type { BoxMember, BoxRole, UserId } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import { boxMemberPermissions } from './box-memberships';

const actorId = userId(1);
const otherId = userId(2);

describe('boxMemberPermissions', () => {
  it('lets owners manage every non-owner member', () => {
    expect(permissions('owner', 'member')).toEqual({
      canLeave: false,
      canRemove: true,
      canPromote: true,
      canDemote: false,
      canAddFriend: true,
      canTransferOwnership: true,
    });
    expect(permissions('owner', 'admin')).toEqual({
      canLeave: false,
      canRemove: true,
      canPromote: false,
      canDemote: true,
      canAddFriend: true,
      canTransferOwnership: true,
    });
  });

  it('lets admins promote and remove non-owner members but not demote admins', () => {
    expect(permissions('admin', 'member')).toEqual({
      canLeave: false,
      canRemove: true,
      canPromote: true,
      canDemote: false,
      canAddFriend: true,
      canTransferOwnership: false,
    });
    expect(permissions('admin', 'admin')).toEqual({
      canLeave: false,
      canRemove: true,
      canPromote: false,
      canDemote: false,
      canAddFriend: true,
      canTransferOwnership: false,
    });
  });

  it('allows non-owner members to leave and protects the creator', () => {
    expect(
      boxMemberPermissions(actorId, 'member', member(actorId, 'member')),
    ).toMatchObject({ canLeave: true, canRemove: false });
    expect(permissions('admin', 'owner')).toEqual({
      canLeave: false,
      canRemove: false,
      canPromote: false,
      canDemote: false,
      canAddFriend: true,
      canTransferOwnership: false,
    });
  });

  it('only offers friendship when there is no existing social connection', () => {
    expect(
      boxMemberPermissions(actorId, 'member', member(otherId, 'member'), true),
    ).toMatchObject({ canAddFriend: false });
    expect(
      boxMemberPermissions(actorId, 'member', member(otherId, 'member'), false),
    ).toMatchObject({ canAddFriend: true });
    expect(
      boxMemberPermissions(actorId, 'member', member(actorId, 'member'), false),
    ).toMatchObject({ canAddFriend: false });
  });
});

function permissions(actorRole: BoxRole, memberRole: BoxRole) {
  return boxMemberPermissions(actorId, actorRole, member(otherId, memberRole));
}

function member(id: UserId, role: BoxRole): Pick<BoxMember, 'role' | 'userId'> {
  return { userId: id, role };
}

function userId(index: number): UserId {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UserId;
}
