import type { Friendship, FriendshipId, UserId } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import { boxInviteOptions } from './box-invitations';

describe('boxInviteOptions', () => {
  it('lists accepted friends alphabetically and excludes current members', () => {
    const memberId = userId(1);
    const availableId = userId(2);
    const withoutUsernameId = userId(3);
    const options = boxInviteOptions(
      [
        friendship(availableId, 'zoe', 'Zoe'),
        friendship(memberId, 'alice', 'Alice'),
        friendship(withoutUsernameId, null, 'Hidden'),
      ],
      [memberId],
    );
    expect(options).toEqual([
      {
        userId: availableId,
        username: 'zoe',
        label: 'Zoe',
        avatarUrl: null,
      },
    ]);
  });
});

function friendship(
  id: UserId,
  username: string | null,
  displayName: string,
): Friendship {
  return {
    id: `00000000-0000-4000-8000-${id.slice(-12)}` as FriendshipId,
    user: { id, username, displayName, avatarUrl: null },
    status: 'accepted',
    direction: 'established',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
}

function userId(index: number): UserId {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UserId;
}
