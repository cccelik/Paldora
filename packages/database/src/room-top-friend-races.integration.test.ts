import { connectTestDatabase, failureOf } from './test-support/connection.js';
import {
  addTopFriend,
  NOT_ELIGIBLE,
  pairWhere,
  roomFixtures,
} from './test-support/rooms.js';
import { eq, sql } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import {
  friendships,
  isBlockedBetween,
  roomTopFriends,
  userBlocks,
  type DatabaseExecutor,
} from './index.js';

const APPLICATION = 'paldora-rooms-schema-test';

const { database } = connectTestDatabase(APPLICATION);

const { newUser, newRoom, topFriendsOf, ownerWithFriends } =
  roomFixtures(database);

/** Resolves once another backend of this test waits on a row lock. */
async function untilSomeoneWaitsOnALock(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // Polling by design: the condition is another session's lock wait.
    const result = await database.execute<{ waiting: boolean }>(sql`
      select exists (
        select 1 from pg_stat_activity
        where application_name = ${APPLICATION}
          and wait_event_type = 'Lock'
      ) as waiting`);
    if (result.rows[0]?.waiting) return;
    await sleep(10);
  }
  throw new Error('No session started waiting on a lock.');
}

describe('Top Friends races', () => {
  type Remove = (
    tx: DatabaseExecutor,
    owner: string,
    friend: string,
  ) => Promise<unknown>;
  const unfriend: Remove = (tx, owner, friend) =>
    tx.delete(friendships).where(pairWhere(owner, friend));
  const blockAndUnfriend: Remove = async (tx, owner, friend) => {
    // BlockService's order: the block row first, then the friendship.
    await tx.insert(userBlocks).values({ blockerId: friend, blockedId: owner });
    await tx.delete(friendships).where(pairWhere(owner, friend));
  };

  it.each([
    ['unfriend', unfriend],
    ['block', blockAndUnfriend],
  ] as const)(
    'an add that commits first is removed by a concurrent %s',
    async (_name, remove) => {
      const { owner, friends } = await ownerWithFriends(1);
      const friend = friends[0] ?? '';
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let added: () => void = () => undefined;
      const wasAdded = new Promise<void>((resolve) => {
        added = resolve;
      });
      const adding = database.transaction(async (tx) => {
        await addTopFriend(tx, owner, friend);
        added();
        await released;
      });
      await wasAdded;
      const removing = database.transaction((tx) => remove(tx, owner, friend));
      await untilSomeoneWaitsOnALock();
      release();
      await adding;
      await removing;
      expect(await topFriendsOf(owner)).toEqual([]);
    },
  );

  it.each([
    ['unfriend', unfriend],
    ['block', blockAndUnfriend],
  ] as const)(
    'an add racing a %s that commits first is refused',
    async (_name, remove) => {
      const { owner, friends } = await ownerWithFriends(1);
      const friend = friends[0] ?? '';
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let removed: () => void = () => undefined;
      const wasRemoved = new Promise<void>((resolve) => {
        removed = resolve;
      });
      const removing = database.transaction(async (tx) => {
        await remove(tx, owner, friend);
        removed();
        await released;
      });
      await wasRemoved;
      const adding = failureOf(addTopFriend(database, owner, friend));
      await untilSomeoneWaitsOnALock();
      release();
      await removing;
      expect(await adding).toEqual(NOT_ELIGIBLE);
      expect(await topFriendsOf(owner)).toEqual([]);
    },
  );
});

describe('is_blocked_between', () => {
  it('agrees with isBlockedBetween in every direction', async () => {
    const cases = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const;
    for (const [firstBlocks, secondBlocks] of cases) {
      // Sequential: each case is a fresh pair.
      const first = await newUser();
      const second = await newUser();
      if (firstBlocks) {
        await database
          .insert(userBlocks)
          .values({ blockerId: first, blockedId: second });
      }
      if (secondBlocks) {
        await database
          .insert(userBlocks)
          .values({ blockerId: second, blockedId: first });
      }
      const result = await database.execute<{ blocked: boolean }>(
        sql`select paldora.is_blocked_between(${first}, ${second}) as blocked`,
      );
      expect(result.rows[0]?.blocked).toBe(firstBlocks || secondBlocks);
      expect(await isBlockedBetween(database, first, second)).toBe(
        firstBlocks || secondBlocks,
      );
    }
  });
});

describe('the Top Friends triggers are what enforce the rules', () => {
  class Rollback extends Error {}

  /** Runs `body` with one trigger disabled, then rolls everything back. */
  async function withoutTrigger<T>(
    table: string,
    trigger: string,
    body: (tx: DatabaseExecutor) => Promise<T>,
  ): Promise<T> {
    let result: T | undefined;
    await expect(
      database.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`alter table paldora.${table} disable trigger ${trigger}`),
        );
        result = await body(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    return result as T;
  }

  it('lets a stranger in only when the insert guard is off', async () => {
    const owner = await newRoom(await newUser());
    const stranger = await newUser();
    const inserted = await withoutTrigger(
      'room_top_friends',
      'room_top_friends_insert_guard',
      async (tx) => {
        await addTopFriend(tx, owner, stranger);
        return tx
          .select()
          .from(roomTopFriends)
          .where(eq(roomTopFriends.roomUserId, owner));
      },
    );
    expect(inserted).toHaveLength(1);
    expect(await topFriendsOf(owner)).toEqual([]);
  });

  it('keeps an ex-friend listed only when the removal trigger is off', async () => {
    const { owner, friends } = await ownerWithFriends(1);
    const friend = friends[0] ?? '';
    await addTopFriend(database, owner, friend);
    const remaining = await withoutTrigger(
      'friendships',
      'friendships_remove_top_friends',
      async (tx) => {
        await tx.delete(friendships).where(pairWhere(owner, friend));
        return tx
          .select()
          .from(roomTopFriends)
          .where(eq(roomTopFriends.roomUserId, owner));
      },
    );
    expect(remaining).toHaveLength(1);
    expect(await topFriendsOf(owner)).toHaveLength(1);
  });
});
