import { Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  hiddenByBlock,
  lockPair,
  orderedPair,
  profiles,
  roomTopFriends,
  rooms,
  users,
  type DatabaseTransaction,
} from '@paldora/database';
import type { RoomView, UpdateRoomTopFriendsInput } from '@paldora/validation';
import { and, asc, eq, inArray, isNotNull, ne, not, or } from 'drizzle-orm';
import { topFriendNotEligible } from './room-errors.js';
import type { RoomState } from './room-records.js';
import { RoomWriteService } from './room-write.service.js';

/** Same people in the same order, same size and audience. Pure. */
export function sameTopFriends(
  current: { ids: readonly string[]; state: RoomState },
  input: Readonly<
    Pick<UpdateRoomTopFriendsInput, 'size' | 'visibility'> & {
      userIds: readonly string[];
    }
  >,
): boolean {
  const { settings } = current.state;
  return (
    settings.topFriendsSize === input.size &&
    settings.topFriendsVisibility === input.visibility &&
    current.ids.length === input.userIds.length &&
    current.ids.every((id, index) => id === input.userIds[index])
  );
}

/**
 * `PUT /me/room/top-friends`: the full list in display order, its size, and
 * its audience. Lock order, so an add never deadlocks with an unfriend or a
 * block of the same pair:
 *
 * 1. the Room row (the write protocol);
 * 2. the pair lock of every person involved, sorted, as `BlockService`
 *    takes it, so a block and this save serialize;
 * 3. the requested friendships `FOR SHARE`, before any Top Friend row is
 *    touched, so an unfriend waits for this save instead of crossing it.
 *
 * Then the size and audience are written first (lowering the size trims in
 * the same statement, and a larger size must exist before higher positions
 * are inserted), and the rows are rewritten delete-then-insert so the
 * position index never trips. The insert guard trigger stays the final
 * authority; the eligibility check here only gives the clean error first.
 */
@Injectable()
export class RoomTopFriendsService {
  public constructor(
    @Inject(RoomWriteService) private readonly writer: RoomWriteService,
  ) {}

  public replace(
    userId: string,
    input: UpdateRoomTopFriendsInput,
  ): Promise<RoomView> {
    return this.writer.write(userId, input.expectedUpdatedAt, {
      unchanged: async (transaction, state) =>
        sameTopFriends(
          { ids: await currentIds(transaction, userId), state },
          input,
        ),
      apply: async (transaction) => {
        const current = await currentIds(transaction, userId);
        await lockPairs(transaction, userId, [...current, ...input.userIds]);
        await assertEligible(transaction, userId, input.userIds);
        await transaction
          .update(rooms)
          .set({
            topFriendsSize: input.size,
            topFriendsVisibility: input.visibility,
          })
          .where(eq(rooms.userId, userId));
        await transaction
          .delete(roomTopFriends)
          .where(eq(roomTopFriends.roomUserId, userId));
        if (input.userIds.length === 0) return;
        await transaction.insert(roomTopFriends).values(
          input.userIds.map((friendUserId, position) => ({
            roomUserId: userId,
            friendUserId,
            position,
          })),
        );
      },
    });
  }
}

async function currentIds(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<string[]> {
  const rows = await transaction
    .select({ id: roomTopFriends.friendUserId })
    .from(roomTopFriends)
    .where(eq(roomTopFriends.roomUserId, userId))
    .orderBy(asc(roomTopFriends.position));
  return rows.map((row) => row.id);
}

async function lockPairs(
  transaction: DatabaseTransaction,
  ownerId: string,
  others: readonly string[],
): Promise<void> {
  const pairs = [...new Set(others)]
    .filter((other) => other !== ownerId)
    .map((other) => orderedPair(ownerId, other))
    .sort((first, second) => first.join(':').localeCompare(second.join(':')));
  for (const [low, high] of pairs) {
    // Protocol: advisory locks must be taken one at a time in this global
    // order, or two saves could deadlock on each other's pairs.
    // eslint-disable-next-line no-await-in-loop
    await lockPair(transaction, low, high);
  }
}

/**
 * Every requested person is an accepted friend of the owner, active, with a
 * username, and with no block either way. The friendships are locked
 * `FOR SHARE` (step 3 above). Any failure is one indistinguishable error.
 */
async function assertEligible(
  transaction: DatabaseTransaction,
  ownerId: string,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const pairs = userIds
    .filter((id) => id !== ownerId)
    .map((id) => orderedPair(ownerId, id));
  const accepted =
    pairs.length === 0
      ? []
      : await transaction
          .select({ id: friendships.id })
          .from(friendships)
          .where(
            and(
              eq(friendships.status, 'accepted'),
              or(
                ...pairs.map(([low, high]) =>
                  and(
                    eq(friendships.userLowId, low),
                    eq(friendships.userHighId, high),
                  ),
                ),
              ),
            ),
          )
          .for('share');
  if (accepted.length !== userIds.length) throw topFriendNotEligible();
  const eligible = await transaction
    .select({ id: users.id })
    .from(users)
    .innerJoin(
      profiles,
      and(eq(profiles.userId, users.id), isNotNull(profiles.username)),
    )
    .where(
      and(
        inArray(users.id, [...userIds]),
        ne(users.id, ownerId),
        eq(users.status, 'active'),
        not(hiddenByBlock(ownerId, users.id)),
      ),
    );
  if (eligible.length !== userIds.length) throw topFriendNotEligible();
}
