import { and, eq } from 'drizzle-orm';
import {
  friendships,
  orderedPair,
  roomTopFriends,
  rooms,
  type DatabaseExecutor,
  type PaldoraDatabase,
} from '../index.js';
import {
  befriend as befriendIn,
  createPerson,
  readyMediaAsset,
} from '../testing/index.js';
import { PG_ERROR } from './connection.js';

/** What the Top Friends guard raises for anyone who is not an eligible friend. */
export const NOT_ELIGIBLE = {
  code: PG_ERROR.INTEGRITY,
  constraint: 'top_friend_not_eligible',
};

export const pairWhere = (first: string, second: string) => {
  const [low, high] = orderedPair(first, second);
  return and(eq(friendships.userLowId, low), eq(friendships.userHighId, high));
};

export const addTopFriend = (
  executor: DatabaseExecutor,
  roomUserId: string,
  friendUserId: string,
  position = 0,
) =>
  executor
    .insert(roomTopFriends)
    .values({ roomUserId, friendUserId, position });

/** Rooms, friendships, and Top Friends rows for the Room schema suites. */
export function roomFixtures(database: PaldoraDatabase) {
  /** A user without a profile: the Room schema never needs one. */
  const newUser = (status: 'active' | 'suspended' = 'active') =>
    createPerson(database, { status, label: 'rooms', profile: false });

  async function newRoom(
    userId: string,
    values: Partial<typeof rooms.$inferInsert> = {},
  ) {
    await database.insert(rooms).values({ userId, ...values });
    return userId;
  }

  const befriend = (
    first: string,
    second: string,
    status: 'pending' | 'accepted' | 'declined' = 'accepted',
  ) => befriendIn(database, first, second, status);

  async function bannerAsset(
    ownerId: string,
    purpose: 'room_banner' | 'avatar' = 'room_banner',
  ) {
    const { id } = await readyMediaAsset(database, {
      ownerId,
      purpose,
      width: 30,
      height: 10,
    });
    return id;
  }

  async function topFriendsOf(roomUserId: string) {
    const rows = await database
      .select({
        friendUserId: roomTopFriends.friendUserId,
        position: roomTopFriends.position,
      })
      .from(roomTopFriends)
      .where(eq(roomTopFriends.roomUserId, roomUserId))
      .orderBy(roomTopFriends.position);
    return rows;
  }

  /** An owner with a Room and `count` accepted friends. */
  async function ownerWithFriends(count: number, size: 4 | 8 | 12 = 8) {
    const owner = await newRoom(await newUser(), { topFriendsSize: size });
    const friends: string[] = [];
    for (let index = 0; index < count; index += 1) {
      // Sequential: each friend is a fresh account and friendship.
      // eslint-disable-next-line no-await-in-loop
      const friend = await newUser();
      // eslint-disable-next-line no-await-in-loop
      await befriend(owner, friend);
      friends.push(friend);
    }
    return { owner, friends };
  }

  const roomUpdate = (userId: string, values: Record<string, unknown>) =>
    database.update(rooms).set(values).where(eq(rooms.userId, userId));

  return {
    newUser,
    newRoom,
    befriend,
    bannerAsset,
    topFriendsOf,
    ownerWithFriends,
    roomUpdate,
  };
}
