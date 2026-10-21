import {
  friendships,
  hiddenByBlock,
  profiles,
  roomTopFriends,
  users,
  type DatabaseExecutor,
} from '@paldora/database';
import { and, asc, eq, isNotNull, not, sql } from 'drizzle-orm';

/**
 * The owner's Top Friends that `viewerId` may see, in display order. The
 * removal triggers already drop entries on unfriend and block; this read
 * re-checks everything anyway, so even a missed trigger cannot show a
 * stranger: the friendship is still accepted, the friend is active with a
 * username, there is no block between owner and friend, and none between
 * the viewer and the friend (that entry is silently left out, with no
 * placeholder and no count). Returns IDs only; the caller attaches
 * summaries, which sign avatars only for these survivors.
 */
export async function visibleTopFriendIds(
  executor: DatabaseExecutor,
  ownerId: string,
  viewerId: string,
): Promise<string[]> {
  const friend = roomTopFriends.friendUserId;
  const rows = await executor
    .select({ id: friend })
    .from(roomTopFriends)
    .innerJoin(users, and(eq(users.id, friend), eq(users.status, 'active')))
    .innerJoin(
      profiles,
      and(eq(profiles.userId, friend), isNotNull(profiles.username)),
    )
    .innerJoin(
      friendships,
      and(
        eq(friendships.userLowId, sql`least(${ownerId}::uuid, ${friend})`),
        eq(friendships.userHighId, sql`greatest(${ownerId}::uuid, ${friend})`),
        eq(friendships.status, 'accepted'),
      ),
    )
    .where(
      and(
        eq(roomTopFriends.roomUserId, ownerId),
        not(hiddenByBlock(ownerId, friend)),
        not(hiddenByBlock(viewerId, friend)),
      ),
    )
    .orderBy(asc(roomTopFriends.position));
  return rows.map((row) => row.id);
}
