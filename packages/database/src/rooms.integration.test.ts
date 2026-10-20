import { requireEnvironmentVariables } from '@paldora/config';
import {
  DEFAULT_ROOM,
  DEFAULT_ROOM_WIDGETS,
  ROOM_ACCENTS,
  ROOM_DECORATION_PACKS,
  ROOM_FONTS,
  ROOM_THEME_PRESETS,
  ROOM_WIDGET_TYPES,
} from '@paldora/domain';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createDatabaseConnection,
  friendships,
  isBlockedBetween,
  mediaAssets,
  orderedPair,
  roomTopFriends,
  roomWidgets,
  rooms,
  userBlocks,
  users,
  type DatabaseExecutor,
} from './index.js';

const APPLICATION = 'paldora-rooms-schema-test';
const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 4,
  applicationName: APPLICATION,
});
const database = connection.database;

afterAll(() => connection.close());

interface PostgresFailure {
  readonly code: string | undefined;
  readonly constraint: string | undefined;
}

/** The PostgreSQL error behind a rejected write (Drizzle wraps it). */
async function failureOf(write: Promise<unknown>): Promise<PostgresFailure> {
  try {
    await write;
  } catch (error) {
    let current: unknown = error;
    while (typeof current === 'object' && current !== null) {
      const candidate = current as {
        code?: unknown;
        constraint?: unknown;
        cause?: unknown;
      };
      if (typeof candidate.code === 'string') {
        return {
          code: candidate.code,
          constraint:
            typeof candidate.constraint === 'string'
              ? candidate.constraint
              : undefined,
        };
      }
      current = candidate.cause;
    }
    throw error;
  }
  throw new Error('The write was expected to fail.');
}

const CHECK = '23514';
const FOREIGN_KEY = '23503';
const INTEGRITY = '23000';
const NOT_ELIGIBLE = { code: INTEGRITY, constraint: 'top_friend_not_eligible' };

async function newUser(status: 'active' | 'suspended' = 'active') {
  const email = `rooms-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({
      authSubject: `rooms-${randomUUID()}`,
      email,
      emailNormalized: email,
      status,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  return user.id;
}

async function newRoom(
  userId: string,
  values: Partial<typeof rooms.$inferInsert> = {},
) {
  await database.insert(rooms).values({ userId, ...values });
  return userId;
}

async function befriend(
  first: string,
  second: string,
  status: 'pending' | 'accepted' | 'declined' = 'accepted',
) {
  const [userLowId, userHighId] = orderedPair(first, second);
  await database
    .insert(friendships)
    .values({ userLowId, userHighId, initiatedByUserId: first, status });
}

const pairWhere = (first: string, second: string) => {
  const [low, high] = orderedPair(first, second);
  return and(eq(friendships.userLowId, low), eq(friendships.userHighId, high));
};

async function bannerAsset(
  ownerUserId: string,
  purpose: 'room_banner' | 'avatar' = 'room_banner',
) {
  const key = `test/${randomUUID()}`;
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ownerUserId,
      purpose,
      status: 'ready',
      contentType: 'image/jpeg',
      contentLength: 1024,
      uploadObjectKey: key,
      uploadExpiresAt: new Date(Date.now() + 60_000),
      masterObjectKey: `${key}/master`,
      displayObjectKey: `${key}/display`,
      thumbnailObjectKey: `${key}/thumbnail`,
      width: 30,
      height: 10,
    })
    .returning({ id: mediaAssets.id });
  if (!asset) throw new Error('asset insert failed');
  return asset.id;
}

const addTopFriend = (
  executor: DatabaseExecutor,
  roomUserId: string,
  friendUserId: string,
  position = 0,
) =>
  executor
    .insert(roomTopFriends)
    .values({ roomUserId, friendUserId, position });

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
    const friend = await newUser();
    await befriend(owner, friend);
    friends.push(friend);
  }
  return { owner, friends };
}

const roomUpdate = (userId: string, values: Record<string, unknown>) =>
  database.update(rooms).set(values).where(eq(rooms.userId, userId));

describe('rooms defaults and allowlists', () => {
  it('stores the domain defaults when only the owner is given', async () => {
    const userId = await newRoom(await newUser());
    const [row] = await database
      .select()
      .from(rooms)
      .where(eq(rooms.userId, userId));
    expect(row).toMatchObject({
      configurationVersion: 1,
      visibility: DEFAULT_ROOM.visibility,
      themePreset: DEFAULT_ROOM.themePreset,
      layout: DEFAULT_ROOM.layout,
      accent: null,
      font: null,
      decorationPack: null,
      sparkles: false,
      bannerMediaId: null,
      bannerPurpose: 'room_banner',
      topFriendsSize: DEFAULT_ROOM.topFriendsSize,
      topFriendsVisibility: DEFAULT_ROOM.topFriendsVisibility,
    });
  });

  it.each([
    ['theme_preset', ROOM_THEME_PRESETS, 'themePreset'],
    ['accent', ROOM_ACCENTS, 'accent'],
    ['font', ROOM_FONTS, 'font'],
    ['decoration_pack', ROOM_DECORATION_PACKS, 'decorationPack'],
  ] as const)(
    'accepts exactly the domain list for %s',
    async (column, values, field) => {
      const userId = await newRoom(await newUser());
      for (const value of values) {
        // Sequential: each update must succeed on the same row.
        await roomUpdate(userId, { [field]: value });
      }
      const failure = await failureOf(
        roomUpdate(userId, { [field]: 'custom' }),
      );
      expect(failure).toEqual({
        code: CHECK,
        constraint: `rooms_${column}_check`,
      });
    },
  );

  it.each([
    ['configuration_version', { configurationVersion: 2 }],
    ['location_length', { location: 'x'.repeat(121) }],
    ['location_length', { location: '' }],
    ['currently_length', { currently: 'x'.repeat(241) }],
    ['music_url', { musicUrl: 'http://example.com/song' }],
    ['music_url', { musicUrl: 'https://example.com/a song' }],
    ['music_url', { musicUrl: 'https://example.com/a\tsong' }],
    ['music_url', { musicUrl: 'https://user:secret@example.com/' }],
    ['music_url', { musicUrl: `https://example.com/${'a'.repeat(2029)}` }],
    ['music_url', { musicUrl: 'javascript:alert(1)' }],
    ['music_text_requires_url', { musicTitle: 'Song' }],
    ['music_text_requires_url', { musicArtist: 'Band' }],
    [
      'music_title_length',
      { musicUrl: 'https://example.com', musicTitle: 'x'.repeat(121) },
    ],
    [
      'music_artist_length',
      { musicUrl: 'https://example.com', musicArtist: '' },
    ],
    ['top_friends_size', { topFriendsSize: 5 }],
  ])('rejects a bad %s', async (name, values) => {
    const failure = await failureOf(newRoom(await newUser(), values));
    expect(failure).toEqual({ code: CHECK, constraint: `rooms_${name}_check` });
  });

  it('accepts the boundaries', async () => {
    await expect(
      newRoom(await newUser(), {
        location: 'x'.repeat(120),
        currently: 'x'.repeat(240),
        musicUrl: `https://example.com/${'a'.repeat(2028)}`,
        musicTitle: 'x'.repeat(120),
        musicArtist: 'y',
        topFriendsSize: 12,
      }),
    ).resolves.toBeDefined();
  });

  it('never accepts a value for the generated banner purpose', async () => {
    const userId = await newUser();
    const failure = await failureOf(
      database.execute(
        sql`insert into paldora.rooms (user_id, banner_purpose) values (${userId}, 'avatar')`,
      ),
    );
    expect(failure.code).toBe('428C9');
  });
});

describe('room banners', () => {
  it('accepts the owner’s own room_banner asset', async () => {
    const owner = await newUser();
    const asset = await bannerAsset(owner);
    await newRoom(owner, { bannerMediaId: asset });
    await roomUpdate(owner, { bannerMediaId: null });
  });

  it('rejects another owner’s asset and another purpose', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const foreign = await failureOf(
      newRoom(owner, { bannerMediaId: await bannerAsset(stranger) }),
    );
    expect(foreign).toEqual({
      code: FOREIGN_KEY,
      constraint: 'rooms_banner_media_fk',
    });
    const avatar = await failureOf(
      newRoom(owner, { bannerMediaId: await bannerAsset(owner, 'avatar') }),
    );
    expect(avatar).toEqual({
      code: FOREIGN_KEY,
      constraint: 'rooms_banner_media_fk',
    });
  });

  it('serves one Room: another Room cannot reuse the asset', async () => {
    const owner = await newUser();
    const asset = await bannerAsset(owner);
    await newRoom(owner, { bannerMediaId: asset });
    // The unique index answers before the (deferred-to-statement-end)
    // foreign key, which would also refuse another owner.
    const failure = await failureOf(
      newRoom(await newUser(), { bannerMediaId: asset }),
    );
    expect(failure).toEqual({
      code: '23505',
      constraint: 'rooms_banner_media_unique',
    });
  });

  it('is user-scoped: a banner never names a Box', async () => {
    const owner = await newUser();
    const failure = await failureOf(
      database.execute(sql`
        with box as (insert into paldora.boxes (name) values ('Banner') returning id)
        insert into paldora.media_assets
          (owner_user_id, purpose, box_id, content_type, content_length, upload_object_key, upload_expires_at)
        select ${owner}, 'room_banner', box.id, 'image/png', 10, ${`test/${randomUUID()}`}, now()
        from box`),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'media_assets_box_scope_check',
    });
  });
});

describe('rooms_touch', () => {
  it('moves updated_at strictly forward, even twice in one transaction', async () => {
    const owner = await newRoom(await newUser());
    const versions = await database.transaction(async (tx) => {
      const seen: string[] = [];
      for (const sparkles of [true, false]) {
        // Sequential: each update must see the previous version.
        const [row] = await tx
          .update(rooms)
          .set({ sparkles })
          .where(eq(rooms.userId, owner))
          .returning({
            at: sql<string>`to_char(${rooms.updatedAt}, 'YYYY-MM-DD HH24:MI:SS.US')`,
          });
        seen.push(row?.at ?? '');
      }
      return seen;
    });
    expect(versions[0] && versions[1] && versions[0] < versions[1]).toBe(true);
  });

  it('ignores an explicit updated_at and steps past a future version', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const owner = await newRoom(await newUser(), { updatedAt: future });
    const [row] = await database
      .update(rooms)
      .set({ sparkles: true, updatedAt: new Date(0) })
      .where(eq(rooms.userId, owner))
      .returning({
        step: sql<string>`(${rooms.updatedAt} - ${future.toISOString()}::timestamptz)::text`,
      });
    expect(row?.step).toBe('00:00:00.000001');
  });

  it('refuses to change the owner or the creation time', async () => {
    const owner = await newRoom(await newUser());
    const other = await newUser();
    for (const values of [{ userId: other }, { createdAt: new Date(0) }]) {
      const failure = await failureOf(roomUpdate(owner, values));
      expect(failure).toEqual({
        code: INTEGRITY,
        constraint: 'rooms_immutable_columns',
      });
    }
  });
});

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
