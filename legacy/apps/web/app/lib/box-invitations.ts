import type { Friendship, UserId } from '@paldora/domain';

export interface BoxInviteOption {
  userId: UserId;
  username: string;
  label: string;
  avatarUrl: string | null;
}

export function boxInviteOptions(
  friends: readonly Friendship[],
  memberUserIds: readonly UserId[],
): BoxInviteOption[] {
  const memberIds = new Set<UserId>(memberUserIds);
  return friends
    .flatMap((friend) => {
      const username = friend.user.username;
      if (!username || memberIds.has(friend.user.id)) return [];
      return [
        {
          userId: friend.user.id,
          username,
          label: friend.user.displayName ?? `@${username}`,
          avatarUrl: friend.user.avatarUrl,
        },
      ];
    })
    .sort((first, second) => first.label.localeCompare(second.label));
}
