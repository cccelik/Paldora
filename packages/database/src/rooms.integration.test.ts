import {
  connectTestDatabase,
  failureOf,
  PG_ERROR,
} from './test-support/connection.js';
import { roomFixtures } from './test-support/rooms.js';
import {
  DEFAULT_ROOM,
  ROOM_ACCENTS,
  ROOM_DECORATION_PACKS,
  ROOM_FONTS,
  ROOM_THEME_PRESETS,
} from '@paldora/domain';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rooms } from './index.js';

const APPLICATION = 'paldora-rooms-schema-test';

const { database } = connectTestDatabase(APPLICATION);

const { newUser, newRoom, bannerAsset, roomUpdate } = roomFixtures(database);

const CHECK = PG_ERROR.CHECK;

const FOREIGN_KEY = PG_ERROR.FOREIGN_KEY;

const INTEGRITY = PG_ERROR.INTEGRITY;

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
