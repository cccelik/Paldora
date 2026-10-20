import { roomTopFriends, rooms, users } from '@paldora/database';
import { roomSchema, type RoomView } from '@paldora/validation';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../testing/http.js';
import { roomTools } from '../testing/rooms.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

/**
 * Top Friends (plan B7, §D Top Friends matrix): who can be one, who sees
 * them, and that unfriending or blocking through the real services removes
 * them atomically, in every order a race can take.
 */
let app: TestApp;
let tools: ReturnType<typeof roomTools>;
beforeAll(async () => {
  app = await createTestApp();
  tools = roomTools(app);
});
afterAll(() => app.close());

const parse = async (response: Response): Promise<RoomView> =>
  roomSchema.parse(await json(response));
const idsOf = (room: RoomView) =>
  room.topFriends.items?.map((item) => item.id) ?? null;

async function ownerWithFriends(count: number) {
  const owner = await app.person('owner');
  const friends = await Promise.all(
    Array.from({ length: count }, () => app.person('friend')),
  );
  for (const friend of friends) {
    // Sequential: the first rate-limited call also opens the Redis link.
    await tools.befriend(owner, friend);
  }
  return { owner, friends };
}

async function storedRows(ownerId: string): Promise<string[]> {
  const rows = await app.database
    .select({ id: roomTopFriends.friendUserId })
    .from(roomTopFriends)
    .where(eq(roomTopFriends.roomUserId, ownerId))
    .orderBy(roomTopFriends.position);
  return rows.map((row) => row.id);
}

describe('choosing Top Friends', () => {
  it('stores accepted friends in the order given', async () => {
    const { owner, friends } = await ownerWithFriends(3);
    const ordered = [friends[2], friends[0], friends[1]] as TestUser[];
    const room = await parse(await tools.setTopFriends(owner, ordered));
    expect(idsOf(room)).toEqual(ordered.map((friend) => friend.id));
    expect(room.topFriends).toMatchObject({ size: 8, visibility: 'friends' });
  });

  it('an identical list is a no-op that keeps the version', async () => {
    const { owner, friends } = await ownerWithFriends(2);
    const saved = await parse(await tools.setTopFriends(owner, friends));
    const again = await parse(
      await tools.as(owner).put('/me/room/top-friends', {
        userIds: friends.map((friend) => friend.id),
        size: 8,
        visibility: 'friends',
        expectedUpdatedAt: null,
      }),
    );
    expect(again.updatedAt).toBe(saved.updatedAt);
  });

  it.each([
    'a stranger',
    'a pending request',
    'yourself',
    'an unknown id',
    'someone you blocked',
    'someone who blocked you',
    'a suspended friend',
  ] as const)('refuses %s with one error, writing nothing', async (kind) => {
    const { owner, friends } = await ownerWithFriends(1);
    const friend = friends[0] as TestUser;
    let target: { id: string } = friend;
    if (kind === 'a stranger') target = await app.person('stranger');
    if (kind === 'a pending request') {
      target = await app.person('pending');
      await json(
        await tools.as(owner).post('/friend-requests', {
          username: (target as TestUser).username,
        }),
        201,
      );
    }
    if (kind === 'yourself') target = owner;
    if (kind === 'an unknown id') target = { id: randomUUID() };
    if (kind === 'someone you blocked') await tools.block(owner, friend);
    if (kind === 'someone who blocked you') await tools.block(friend, owner);
    if (kind === 'a suspended friend') {
      await app.database
        .update(users)
        .set({ status: 'suspended' })
        .where(eq(users.id, friend.id));
    }
    const response = await tools.as(owner).put('/me/room/top-friends', {
      userIds: [target.id],
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: null,
    });
    await expectError(response, 422, 'TOP_FRIEND_NOT_ELIGIBLE');
    expect((await tools.myRoom(owner)).updatedAt).toBeNull();
  });

  it('lowering the size keeps the new list; more ids than the size is invalid', async () => {
    const { owner, friends } = await ownerWithFriends(6);
    await parse(await tools.setTopFriends(owner, friends, { size: 8 }));
    await expectError(
      await tools.setTopFriends(owner, friends, { size: 4 }),
      400,
      'VALIDATION_FAILED',
    );
    const kept = friends.slice(2, 6);
    const lowered = await parse(
      await tools.setTopFriends(owner, kept, { size: 4 }),
    );
    expect(idsOf(lowered)).toEqual(kept.map((friend) => friend.id));
    expect(await storedRows(owner.id)).toEqual(kept.map((friend) => friend.id));
    const raised = await parse(
      await tools.setTopFriends(owner, friends, { size: 12 }),
    );
    expect(idsOf(raised)).toHaveLength(6);
  });

  it('renumbers gaps left by an automatic removal on the next change', async () => {
    const { owner, friends } = await ownerWithFriends(3);
    await parse(await tools.setTopFriends(owner, friends));
    await ok(await tools.as(owner).delete(`/friends/${friends[0]?.id}`));
    const rest = friends.slice(1).reverse();
    await parse(await tools.setTopFriends(owner, rest));
    const positions = await app.database
      .select({
        id: roomTopFriends.friendUserId,
        position: roomTopFriends.position,
      })
      .from(roomTopFriends)
      .where(eq(roomTopFriends.roomUserId, owner.id))
      .orderBy(roomTopFriends.position);
    expect(positions).toEqual(
      rest.map((friend, position) => ({ id: friend.id, position })),
    );
  });
});

describe('who sees Top Friends', () => {
  async function scene(visibility: 'visible' | 'friends' | 'hidden') {
    const { owner, friends } = await ownerWithFriends(2);
    const [friend, top] = friends as [TestUser, TestUser];
    const member = await app.person('member');
    await tools.sharedBox(owner, member);
    await tools.patchRoom(owner, { visibility: 'members' });
    await parse(await tools.setTopFriends(owner, [top], { visibility }));
    return { owner, friend, member, top };
  }

  it.each([
    ['visible', [true, true, true]],
    ['friends', [true, true, false]],
    ['hidden', [true, false, false]],
  ] as const)(
    '%s: owner, friend, Box member',
    async (visibility, [ownerSees, friendSees, memberSees]) => {
      const { owner, friend, member, top } = await scene(visibility);
      const expected = (sees: boolean) => (sees ? [top.id] : null);
      expect(idsOf(await tools.myRoom(owner))).toEqual(expected(ownerSees));
      expect(idsOf(await tools.visit(friend, owner))).toEqual(
        expected(friendSees),
      );
      expect(idsOf(await tools.visit(member, owner))).toEqual(
        expected(memberSees),
      );
    },
  );

  it('omits a Top Friend in a block with the viewer, for that viewer only', async () => {
    const { owner, friend, member, top } = await scene('visible');
    await tools.block(top, member);
    expect(idsOf(await tools.visit(member, owner))).toEqual([]);
    expect(idsOf(await tools.visit(friend, owner))).toEqual([top.id]);
  });

  it('omits a suspended Top Friend on read while the row remains', async () => {
    const { owner, friend, top } = await scene('visible');
    await app.database
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, top.id));
    expect(idsOf(await tools.visit(friend, owner))).toEqual([]);
    expect(idsOf(await tools.myRoom(owner))).toEqual([]);
    expect(await storedRows(owner.id)).toEqual([top.id]);
  });
});

describe('removal through FriendshipService and BlockService', () => {
  type Removal = (owner: TestUser, friend: TestUser) => Promise<void>;
  const removals: [string, Removal][] = [
    [
      'the owner unfriends',
      async (owner, friend) =>
        ok(await tools.as(owner).delete(`/friends/${friend.id}`)),
    ],
    [
      'the friend unfriends',
      async (owner, friend) =>
        ok(await tools.as(friend).delete(`/friends/${owner.id}`)),
    ],
    ['the owner blocks', (owner, friend) => tools.block(owner, friend)],
    ['the friend blocks', (owner, friend) => tools.block(friend, owner)],
  ];

  it.each(removals)(
    'removes the entry in the same transaction when %s',
    async (_name, remove) => {
      const { owner, friends } = await ownerWithFriends(2);
      const [gone, stays] = friends as [TestUser, TestUser];
      await parse(await tools.setTopFriends(owner, friends));
      await remove(owner, gone);
      expect(await storedRows(owner.id)).toEqual([stays.id]);
      expect(idsOf(await tools.myRoom(owner))).toEqual([stays.id]);
    },
  );

  it('removes both directions: each person’s list loses the other', async () => {
    const [first, second] = [await app.person('a'), await app.person('b')];
    await tools.befriend(first, second);
    await parse(await tools.setTopFriends(first, [second]));
    await parse(await tools.setTopFriends(second, [first]));
    await tools.block(second, first);
    expect(await storedRows(first.id)).toEqual([]);
    expect(await storedRows(second.id)).toEqual([]);
  });

  /**
   * Holds the owner's Room row lock in a test transaction, so the save
   * queues behind it; runs `remove` through the real API meanwhile, then
   * releases. The save must then see the removal and refuse.
   */
  async function saveQueuedBehind(
    owner: TestUser,
    friend: TestUser,
    remove: Removal,
  ): Promise<Response> {
    let saving: Promise<Response> | undefined;
    await app.database.transaction(async (transaction) => {
      const pid = await transaction.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      const holder = pid.rows[0]?.pid ?? 0;
      await transaction
        .select({ userId: rooms.userId })
        .from(rooms)
        .where(eq(rooms.userId, owner.id))
        .for('update');
      saving = tools.as(owner).put('/me/room/top-friends', {
        userIds: [friend.id],
        size: 8,
        visibility: 'friends',
        expectedUpdatedAt: (
          await app.database
            .select({
              version: sql<string>`to_char(${rooms.updatedAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
            })
            .from(rooms)
            .where(eq(rooms.userId, owner.id))
        )[0]?.version,
      });
      await untilBlockedBy(holder);
      await remove(owner, friend);
    });
    if (!saving) throw new Error('save never started');
    return saving;
  }

  it.each(removals)(
    'a save racing a removal that commits first is refused (%s)',
    async (_name, remove) => {
      const { owner, friends } = await ownerWithFriends(1);
      const friend = friends[0] as TestUser;
      // A Room row must exist for the save to queue on its lock.
      await tools.patchRoom(owner, { sparkles: true });
      const response = await saveQueuedBehind(owner, friend, remove);
      await expectError(response, 422, 'TOP_FRIEND_NOT_ELIGIBLE');
      expect(await storedRows(owner.id)).toEqual([]);
    },
  );

  it.each(removals)(
    'concurrent saves and removals never leave a stale entry (%s)',
    async (_name, remove) => {
      const pairs = await Promise.all(
        Array.from({ length: 4 }, () => ownerWithFriends(1)),
      );
      const results = await Promise.all(
        pairs.map(async ({ owner, friends }) => {
          const friend = friends[0] as TestUser;
          const [saved] = await Promise.all([
            tools.setTopFriends(owner, [friend]),
            remove(owner, friend),
          ]);
          return { owner, status: saved.status };
        }),
      );
      for (const { owner, status } of results) {
        expect([200, 422]).toContain(status);
        // Sequential reads after the race; the invariant is what matters.
        expect(await storedRows(owner.id)).toEqual([]);
      }
    },
  );

  it('two owners saving the same friend while that friend unfriends one of them', async () => {
    const [first, second, friend] = [
      await app.person('first'),
      await app.person('second'),
      await app.person('friend'),
    ];
    await tools.befriend(first, friend);
    await tools.befriend(second, friend);
    const [one, two] = await Promise.all([
      tools.setTopFriends(first, [friend]),
      tools.setTopFriends(second, [friend]),
      tools
        .as(friend)
        .delete(`/friends/${first.id}`)
        .then((response) => ok(response)),
    ]);
    expect([200, 422]).toContain(one.status);
    expect(two.status).toBe(200);
    expect(await storedRows(first.id)).toEqual([]);
    expect(await storedRows(second.id)).toEqual([friend.id]);
  });

  it('lowering the size while a listed friend unfriends neither deadlocks nor leaves them', async () => {
    const { owner, friends } = await ownerWithFriends(8);
    await parse(await tools.setTopFriends(owner, friends, { size: 8 }));
    const leaving = friends[1] as TestUser;
    const [lowered] = await Promise.all([
      tools.setTopFriends(owner, friends.slice(0, 4), { size: 4 }),
      tools
        .as(leaving)
        .delete(`/friends/${owner.id}`)
        .then((response) => ok(response)),
    ]);
    // Either order is fine: the save first (then the trigger removes them)
    // or the unfriend first (then the save, which lists them, is refused).
    expect([200, 422]).toContain(lowered.status);
    const stored = await storedRows(owner.id);
    expect(stored).not.toContain(leaving.id);
    expect(stored).toHaveLength(lowered.status === 200 ? 3 : 7);
  });
});

/** Resolves once some backend waits on a lock held by backend `holder`. */
async function untilBlockedBy(holder: number): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    // Polling by design: the condition is another session's lock wait.
    const result = await app.database.execute<{ waiting: boolean }>(sql`
      select exists (
        select 1 from pg_stat_activity
        where ${holder}::int = any (pg_blocking_pids(pid))
      ) as waiting`);
    if (result.rows[0]?.waiting) return;
    await sleep(10);
  }
  throw new Error('The save never queued behind the Room lock.');
}
