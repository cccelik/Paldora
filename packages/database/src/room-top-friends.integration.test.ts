import {
  connectTestDatabase,
  failureOf,
  PG_ERROR,
} from './test-support/connection.js';
import {
  addTopFriend,
  NOT_ELIGIBLE,
  pairWhere,
  roomFixtures,
} from './test-support/rooms.js';
import { DEFAULT_ROOM_WIDGETS, ROOM_WIDGET_TYPES } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  friendships,
  rooms,
  roomTopFriends,
  roomWidgets,
  userBlocks,
} from './index.js';

const APPLICATION = 'paldora-rooms-schema-test';

const { database } = connectTestDatabase(APPLICATION);

const {
  newUser,
  newRoom,
  befriend,
  topFriendsOf,
  ownerWithFriends,
  roomUpdate,
} = roomFixtures(database);

const INTEGRITY = PG_ERROR.INTEGRITY;

describe('room widgets', () => {
  const widgetRows = (roomUserId: string) =>
    DEFAULT_ROOM_WIDGETS.map((widget) => ({
      roomUserId,
      widgetType: widget.type,
      placement: widget.placement,
      position: widget.position,
      enabled: widget.enabled,
    }));

  it('accepts all seven domain types, and a full replace in one transaction', async () => {
    const owner = await newRoom(await newUser());
    await database.insert(roomWidgets).values(widgetRows(owner));
    await database.transaction(async (tx) => {
      await tx.delete(roomWidgets).where(eq(roomWidgets.roomUserId, owner));
      await tx.insert(roomWidgets).values(
        widgetRows(owner).map((row) => ({
          ...row,
          position: 6 - row.position,
          enabled: row.widgetType !== 'music',
        })),
      );
    });
    const stored = await database
      .select({ type: roomWidgets.widgetType })
      .from(roomWidgets)
      .where(eq(roomWidgets.roomUserId, owner))
      .orderBy(roomWidgets.position);
    expect(stored.map((row) => row.type)).toEqual(
      [...ROOM_WIDGET_TYPES].reverse(),
    );
  });

  it('rejects an incomplete set at commit, and accepts removing all seven', async () => {
    const owner = await newRoom(await newUser());
    const partial = await failureOf(
      database.insert(roomWidgets).values(widgetRows(owner).slice(0, 3)),
    );
    expect(partial).toEqual({
      code: INTEGRITY,
      constraint: 'room_widgets_incomplete',
    });
    await database.insert(roomWidgets).values(widgetRows(owner));
    const missingOne = await failureOf(
      database
        .delete(roomWidgets)
        .where(
          and(
            eq(roomWidgets.roomUserId, owner),
            eq(roomWidgets.widgetType, 'music'),
          ),
        ),
    );
    expect(missingOne.constraint).toBe('room_widgets_incomplete');
    await database.delete(roomWidgets).where(eq(roomWidgets.roomUserId, owner));
  });

  it('rejects an unknown type, position 7, and a shared position', async () => {
    const owner = await newRoom(await newUser());
    const rows = widgetRows(owner);
    const unknown = await failureOf(
      database
        .insert(roomWidgets)
        .values(
          rows.map((row, index) =>
            index === 0 ? { ...row, widgetType: 'guestbook' } : row,
          ),
        ),
    );
    expect(unknown.constraint).toBe('room_widgets_type_check');
    const seventh = await failureOf(
      database
        .insert(roomWidgets)
        .values(
          rows.map((row, index) =>
            index === 6 ? { ...row, position: 7 } : row,
          ),
        ),
    );
    expect(seventh.constraint).toBe('room_widgets_position_check');
    const shared = await failureOf(
      database
        .insert(roomWidgets)
        .values(
          rows.map((row, index) =>
            index === 6 ? { ...row, position: 0 } : row,
          ),
        ),
    );
    expect(shared.constraint).toBe('room_widgets_position_unique');
  });

  it('cascade with the Room, together with its Top Friends', async () => {
    const { owner, friends } = await ownerWithFriends(1);
    await database.insert(roomWidgets).values(widgetRows(owner));
    await addTopFriend(database, owner, friends[0] ?? '');
    await database.delete(rooms).where(eq(rooms.userId, owner));
    expect(
      await database
        .select()
        .from(roomWidgets)
        .where(eq(roomWidgets.roomUserId, owner)),
    ).toEqual([]);
    expect(await topFriendsOf(owner)).toEqual([]);
  });
});

describe('room_top_friends_insert_guard', () => {
  it('accepts accepted, active friends below the size, in order', async () => {
    const { owner, friends } = await ownerWithFriends(4, 4);
    for (const [position, friend] of friends.entries()) {
      // Sequential: positions are unique per Room.
      await addTopFriend(database, owner, friend, position);
    }
    expect((await topFriendsOf(owner)).map((row) => row.friendUserId)).toEqual(
      friends,
    );
  });

  it('rejects a position at or beyond the Room size', async () => {
    const { owner, friends } = await ownerWithFriends(1, 4);
    const failure = await failureOf(
      addTopFriend(database, owner, friends[0] ?? '', 4),
    );
    expect(failure).toEqual({
      code: INTEGRITY,
      constraint: 'top_friend_position_out_of_range',
    });
    const twelve = await failureOf(
      addTopFriend(
        database,
        await newRoom(await newUser(), { topFriendsSize: 12 }),
        friends[0] ?? '',
        12,
      ),
    );
    expect(twelve.code).toBe(INTEGRITY);
  });

  it.each([
    ['a stranger', null],
    ['a pending request', 'pending'],
    ['a declined request', 'declined'],
  ] as const)('rejects %s', async (_name, status) => {
    const owner = await newRoom(await newUser());
    const other = await newUser();
    if (status) await befriend(owner, other, status);
    expect(await failureOf(addTopFriend(database, owner, other))).toEqual(
      NOT_ELIGIBLE,
    );
  });

  it.each(['owner blocks', 'friend blocks'] as const)(
    'rejects an accepted friend when the %s',
    async (direction) => {
      const { owner, friends } = await ownerWithFriends(1);
      const friend = friends[0] ?? '';
      // The friendship stays, so only the block branch can refuse.
      await database
        .insert(userBlocks)
        .values(
          direction === 'owner blocks'
            ? { blockerId: owner, blockedId: friend }
            : { blockerId: friend, blockedId: owner },
        );
      expect(await failureOf(addTopFriend(database, owner, friend))).toEqual(
        NOT_ELIGIBLE,
      );
    },
  );

  it('rejects a suspended friend, self, and an unknown person', async () => {
    const owner = await newRoom(await newUser());
    const suspended = await newUser('suspended');
    await befriend(owner, suspended);
    expect(await failureOf(addTopFriend(database, owner, suspended))).toEqual(
      NOT_ELIGIBLE,
    );
    expect(await failureOf(addTopFriend(database, owner, owner))).toEqual(
      NOT_ELIGIBLE,
    );
    const unknown = await failureOf(
      addTopFriend(database, owner, randomUUID()),
    );
    expect(unknown).toEqual(NOT_ELIGIBLE);
  });

  it('guards updates too: a row cannot be pointed at a stranger', async () => {
    const { owner, friends } = await ownerWithFriends(1);
    await addTopFriend(database, owner, friends[0] ?? '');
    const stranger = await newUser();
    const failure = await failureOf(
      database
        .update(roomTopFriends)
        .set({ friendUserId: stranger })
        .where(eq(roomTopFriends.roomUserId, owner)),
    );
    expect(failure).toEqual(NOT_ELIGIBLE);
  });
});

describe('Top Friends removal', () => {
  /** Two friends who list each other, plus a bystander in each Room. */
  async function mutualTopFriends() {
    const first = await newRoom(await newUser());
    const second = await newRoom(await newUser());
    await befriend(first, second);
    const bystander = await newUser();
    await befriend(first, bystander);
    await befriend(second, bystander);
    await addTopFriend(database, first, second, 0);
    await addTopFriend(database, first, bystander, 1);
    await addTopFriend(database, second, first, 0);
    await addTopFriend(database, second, bystander, 1);
    return { first, second, bystander };
  }

  const listed = async (roomUserId: string) =>
    (await topFriendsOf(roomUserId)).map((row) => row.friendUserId);

  it('removes both directions when the friendship is deleted', async () => {
    const { first, second, bystander } = await mutualTopFriends();
    await database.delete(friendships).where(pairWhere(first, second));
    expect(await listed(first)).toEqual([bystander]);
    expect(await listed(second)).toEqual([bystander]);
  });

  it('removes both directions when the status leaves accepted', async () => {
    const { first, second, bystander } = await mutualTopFriends();
    await database
      .update(friendships)
      .set({ status: 'declined' })
      .where(pairWhere(first, second));
    expect(await listed(first)).toEqual([bystander]);
    expect(await listed(second)).toEqual([bystander]);
  });

  it('keeps entries when an accepted friendship is touched but stays accepted', async () => {
    const { first, second, bystander } = await mutualTopFriends();
    await database
      .update(friendships)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(pairWhere(first, second));
    expect(await listed(first)).toEqual([second, bystander]);
  });

  it.each(['first blocks', 'second blocks'] as const)(
    'removes both directions when the %s',
    async (direction) => {
      const { first, second, bystander } = await mutualTopFriends();
      await database
        .insert(userBlocks)
        .values(
          direction === 'first blocks'
            ? { blockerId: first, blockedId: second }
            : { blockerId: second, blockedId: first },
        );
      expect(await listed(first)).toEqual([bystander]);
      expect(await listed(second)).toEqual([bystander]);
    },
  );

  it('rolls back with the transaction that unfriended', async () => {
    const { first, second } = await mutualTopFriends();
    await expect(
      database.transaction(async (tx) => {
        await tx.delete(friendships).where(pairWhere(first, second));
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    expect(await listed(first)).toContain(second);
    expect(await listed(second)).toContain(first);
  });

  it('trims entries beyond a lowered size, keeping gaps for the service', async () => {
    const { owner, friends } = await ownerWithFriends(6, 8);
    for (const [position, friend] of friends.entries()) {
      // Sequential: positions are unique per Room.
      await addTopFriend(database, owner, friend, position);
    }
    await roomUpdate(owner, { topFriendsSize: 4 });
    expect((await topFriendsOf(owner)).map((row) => row.position)).toEqual([
      0, 1, 2, 3,
    ]);
    await roomUpdate(owner, { topFriendsSize: 12 });
    expect(await topFriendsOf(owner)).toHaveLength(4);
  });
});
