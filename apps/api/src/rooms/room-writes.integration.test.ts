import { mediaAssets, mediaJobOutbox, rooms } from '@paldora/database';
import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { roomSchema, type RoomView } from '@paldora/validation';
import { and, count, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json } from '../testing/http.js';
import { roomTools } from '../testing/rooms.js';
import { scenes } from '../testing/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

/**
 * Room writes (plan §E): the shared version, stale saves, idempotent
 * retries, lazy creation, the banner claim and retirement, and the shared
 * rate limit. Each test builds its own people.
 */
let app: TestApp;
let tools: ReturnType<typeof roomTools>;
beforeAll(async () => {
  app = await createTestApp();
  tools = roomTools(app);
});
afterAll(() => app.close());

const patch = (user: TestUser, body: Record<string, unknown>) =>
  tools.as(user).patch('/me/room', body);
const putWidgets = (
  user: TestUser,
  widgets: unknown,
  expectedUpdatedAt: string | null,
) => tools.as(user).put('/me/room/widgets', { widgets, expectedUpdatedAt });
const parse = async (response: Response): Promise<RoomView> =>
  roomSchema.parse(await json(response));

async function savedOwner(): Promise<{ owner: TestUser; room: RoomView }> {
  const owner = await app.person('owner');
  const room = await parse(
    await patch(owner, { themePreset: 'neon_night', expectedUpdatedAt: null }),
  );
  return { owner, room };
}

/** How many times the Room row was written since creation is unknowable; its version is. */
async function storedVersion(userId: string): Promise<string | undefined> {
  const [row] = await app.database
    .select({
      version: sql<string>`to_char(${rooms.updatedAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(rooms)
    .where(eq(rooms.userId, userId));
  return row?.version;
}

describe('PATCH /me/room', () => {
  it('changes only the fields sent; a null override follows the preset', async () => {
    const { owner, room } = await savedOwner();
    const accented = await parse(
      await patch(owner, {
        accent: 'emerald',
        font: 'mono',
        location: '  Lisbon  ',
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    expect(accented.style).toMatchObject({
      themePreset: 'neon_night',
      accent: 'emerald',
      font: 'mono',
    });
    expect(accented.location).toBe('Lisbon');
    const reset = await parse(
      await patch(owner, {
        accent: null,
        location: '',
        expectedUpdatedAt: accented.updatedAt,
      }),
    );
    expect(reset.style).toMatchObject({ accent: null, font: 'mono' });
    expect(reset.location).toBeNull();
    expect(reset.updatedAt! > accented.updatedAt!).toBe(true);
  });

  it('stores a normalized https music link and removes the card with null', async () => {
    const { owner, room } = await savedOwner();
    const withMusic = await parse(
      await patch(owner, {
        music: {
          url: 'https://Music.Example.com/a b'.replace(' ', '%20'),
          artist: 'Band',
        },
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    expect(withMusic.music).toEqual({
      url: 'https://music.example.com/a%20b',
      title: null,
      artist: 'Band',
    });
    const without = await parse(
      await patch(owner, {
        music: null,
        expectedUpdatedAt: withMusic.updatedAt,
      }),
    );
    expect(without.music).toBeNull();
  });

  it.each([
    ['an http link', { music: { url: 'http://example.com/song' } }],
    ['a javascript: link', { music: { url: 'javascript:alert(1)' } }],
    ['custom CSS', { css: 'body{}' }],
    ['a background URL', { backgroundUrl: 'https://example.com/x.png' }],
    ['an unknown theme', { themePreset: 'vaporwave' }],
    ['nothing to change', {}],
  ])('rejects %s with VALIDATION_FAILED', async (_name, body) => {
    const owner = await app.person('owner');
    await expectError(
      await patch(owner, { ...body, expectedUpdatedAt: null }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('requires expectedUpdatedAt (null is a value, absence is not)', async () => {
    const owner = await app.person('owner');
    await expectError(
      await patch(owner, { sparkles: true }),
      400,
      'VALIDATION_FAILED',
    );
  });
});

describe('stale saves and idempotent retries', () => {
  it('a request equal to the stored state succeeds without a write, even when behind', async () => {
    const { owner, room } = await savedOwner();
    const newer = await parse(
      await patch(owner, { sparkles: true, expectedUpdatedAt: room.updatedAt }),
    );
    // A lost-response retry of the same save, carrying the old version.
    const retried = await parse(
      await patch(owner, { sparkles: true, expectedUpdatedAt: room.updatedAt }),
    );
    expect(retried.updatedAt).toBe(newer.updatedAt);
    expect(await storedVersion(owner.id)).toBe(newer.updatedAt);
    // A different change from the same old version is stale.
    await expectError(
      await patch(owner, {
        layout: 'single',
        expectedUpdatedAt: room.updatedAt,
      }),
      409,
      'ROOM_UPDATE_STALE',
    );
  });

  it('a no-op on a never-saved Room creates no row', async () => {
    const owner = await app.person('owner');
    const same = await parse(
      await patch(owner, {
        visibility: 'friends',
        themePreset: 'cream_paper',
        expectedUpdatedAt: '2020-01-01T00:00:00.000000Z',
      }),
    );
    expect(same.updatedAt).toBeNull();
    expect(await storedVersion(owner.id)).toBeUndefined();
    const widgets = await parse(
      await putWidgets(owner, DEFAULT_ROOM_WIDGETS, null),
    );
    expect(widgets.updatedAt).toBeNull();
    expect(await storedVersion(owner.id)).toBeUndefined();
  });

  it('a millisecond rendering of the version is stale (exact match only)', async () => {
    const { owner, room } = await savedOwner();
    const millis = new Date(room.updatedAt ?? '').toISOString();
    await expectError(
      await patch(owner, { sparkles: true, expectedUpdatedAt: millis }),
      409,
      'ROOM_UPDATE_STALE',
    );
  });

  it('a widgets save after a settings save from another tab is stale', async () => {
    const { owner, room } = await savedOwner();
    await parse(
      await patch(owner, {
        layout: 'single',
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    const reordered = [...DEFAULT_ROOM_WIDGETS].map((widget, index) => ({
      ...widget,
      position: 6 - index,
    }));
    await expectError(
      await putWidgets(owner, reordered, room.updatedAt),
      409,
      'ROOM_UPDATE_STALE',
    );
  });

  it.each([
    ['two settings saves', 'patch', 'patch'],
    ['a settings and a widgets save', 'patch', 'widgets'],
    ['two first saves of a new Room', 'first', 'first'],
  ] as const)(
    'of %s with the same version, exactly one wins',
    async (_name, firstKind, secondKind) => {
      const owner = await app.person('owner');
      const version =
        firstKind === 'first'
          ? null
          : (
              await parse(
                await patch(owner, { sparkles: true, expectedUpdatedAt: null }),
              )
            ).updatedAt;
      const send = (kind: string, index: number) =>
        kind === 'widgets'
          ? putWidgets(
              owner,
              DEFAULT_ROOM_WIDGETS.map((widget) =>
                widget.type === 'music'
                  ? { ...widget, enabled: false }
                  : widget,
              ),
              version,
            )
          : patch(owner, {
              themePreset: index === 0 ? 'cyberpunk' : 'daisy_day',
              expectedUpdatedAt: version,
            });
      const responses = await Promise.all([
        send(firstKind, 0),
        send(secondKind, 1),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 409]);
      const loser = responses.find((response) => response.status === 409);
      if (loser) await expectError(loser, 409, 'ROOM_UPDATE_STALE');
    },
  );

  it('every save moves the version strictly forward', async () => {
    const { owner, room } = await savedOwner();
    let version = room.updatedAt;
    for (const sparkles of [true, false, true]) {
      // Sequential: each save names the previous one's version.
      const next = await parse(
        await patch(owner, { sparkles, expectedUpdatedAt: version }),
      );
      expect(next.updatedAt! > version!).toBe(true);
      version = next.updatedAt;
    }
  });
});

describe('PUT /me/room/widgets', () => {
  it('replaces all seven rows, keeping disabled ones for the owner only', async () => {
    const { owner, room } = await savedOwner();
    const widgets = DEFAULT_ROOM_WIDGETS.map((widget, index) => ({
      ...widget,
      placement: 'main' as const,
      position: (index + 3) % 7,
      enabled: widget.type !== 'memories',
    }));
    const saved = await parse(await putWidgets(owner, widgets, room.updatedAt));
    expect(saved.widgets.map((widget) => widget.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(saved.widgets[0]).toMatchObject({ type: 'life_updates' });
    expect(
      saved.widgets.find((widget) => widget.type === 'memories'),
    ).toMatchObject({
      enabled: false,
    });
  });

  it.each([
    ['six widgets', DEFAULT_ROOM_WIDGETS.slice(1)],
    [
      'a duplicate type',
      DEFAULT_ROOM_WIDGETS.map((widget, index) =>
        index === 1 ? { ...widget, type: 'currently' } : widget,
      ),
    ],
    [
      'a shared position',
      DEFAULT_ROOM_WIDGETS.map((widget, index) =>
        index === 1 ? { ...widget, position: 0 } : widget,
      ),
    ],
    [
      'an unknown type',
      DEFAULT_ROOM_WIDGETS.map((widget, index) =>
        index === 1 ? { ...widget, type: 'guestbook' } : widget,
      ),
    ],
  ])('rejects %s', async (_name, widgets) => {
    const owner = await app.person('owner');
    await expectError(
      await putWidgets(owner, widgets, null),
      400,
      'VALIDATION_FAILED',
    );
  });
});

describe('banner', () => {
  const scene = () => scenes(app);

  it('attaches a ready banner and serves it signed', async () => {
    const { owner, room } = await savedOwner();
    const banner = await tools.readyBanner(owner);
    const saved = await parse(
      await patch(owner, {
        bannerMediaId: banner.id,
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    expect(saved.banner?.bannerMediaId).toBe(banner.id);
    // Same banner again: a no-op that keeps the version.
    const again = await parse(
      await patch(owner, {
        bannerMediaId: banner.id,
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    expect(again.updatedAt).toBe(saved.updatedAt);
  });

  it('refuses a banner still processing with MEDIA_NOT_READY', async () => {
    const owner = await app.person('owner');
    const banner = await tools.readyBanner(owner, {
      status: 'processing',
      displayObjectKey: null,
      thumbnailObjectKey: null,
      masterObjectKey: null,
    });
    await expectError(
      await patch(owner, { bannerMediaId: banner.id, expectedUpdatedAt: null }),
      409,
      'MEDIA_NOT_READY',
    );
  });

  it.each([
    'another person’s',
    'a post photo',
    'a deleted',
    'an unknown',
  ] as const)(
    'refuses %s asset with MEDIA_NOT_FOUND, writing nothing',
    async (kind) => {
      const owner = await app.person('owner');
      let id: string;
      if (kind === 'another person’s') {
        id = (await tools.readyBanner(await app.person('other'))).id;
      } else if (kind === 'a post photo') {
        const box = await scene().newBox(owner);
        id = await scene().cameraImage(owner, box.id, {
          purpose: 'post_image',
        });
      } else if (kind === 'a deleted') {
        id = (await tools.readyBanner(owner, { status: 'deleted' })).id;
      } else {
        id = randomUUID();
      }
      await expectError(
        await patch(owner, { bannerMediaId: id, expectedUpdatedAt: null }),
        404,
        'MEDIA_NOT_FOUND',
      );
      expect(await storedVersion(owner.id)).toBeUndefined();
    },
  );

  it('replacing retires the previous banner and leaves none of its objects', async () => {
    const { owner, room } = await savedOwner();
    const first = await tools.readyBanner(owner);
    const second = await tools.readyBanner(owner);
    const attached = await parse(
      await patch(owner, {
        bannerMediaId: first.id,
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    const replaced = await parse(
      await patch(owner, {
        bannerMediaId: second.id,
        expectedUpdatedAt: attached.updatedAt,
      }),
    );
    expect(replaced.banner?.bannerMediaId).toBe(second.id);
    const [old] = await app.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, first.id));
    expect(old?.status).toBe('deleted');
    expect(await tools.drainDeletions(first.id)).toEqual([]);
    // The new banner's objects are untouched.
    expect(await tools.drainDeletions(second.id)).toHaveLength(4);
  });

  it('removing retires the banner in the same save', async () => {
    const { owner, room } = await savedOwner();
    const banner = await tools.readyBanner(owner);
    const attached = await parse(
      await patch(owner, {
        bannerMediaId: banner.id,
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    const removed = await parse(
      await patch(owner, {
        bannerMediaId: null,
        expectedUpdatedAt: attached.updatedAt,
      }),
    );
    expect(removed.banner).toBeNull();
    expect(await tools.drainDeletions(banner.id)).toEqual([]);
  });

  it('a failed save retires nothing', async () => {
    const { owner, room } = await savedOwner();
    const banner = await tools.readyBanner(owner);
    const attached = await parse(
      await patch(owner, {
        bannerMediaId: banner.id,
        expectedUpdatedAt: room.updatedAt,
      }),
    );
    const other = await tools.readyBanner(await app.person('other'));
    await expectError(
      await patch(owner, {
        bannerMediaId: other.id,
        expectedUpdatedAt: attached.updatedAt,
      }),
      404,
      'MEDIA_NOT_FOUND',
    );
    const [{ value } = { value: -1 }] = await app.database
      .select({ value: count() })
      .from(mediaJobOutbox)
      .where(
        and(
          eq(mediaJobOutbox.jobType, 'media.delete'),
          sql`${mediaJobOutbox.payload}::text like ${`%${banner.id}%`}`,
        ),
      );
    expect(value).toBe(0);
    expect((await tools.myRoom(owner)).banner?.bannerMediaId).toBe(banner.id);
  });
});

describe('rate limit', () => {
  it('shares 120 writes an hour across every Room section', async () => {
    const owner = await app.person('busy');
    const statuses: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      // Sequential, so the 121st attempt is unambiguous. No-op saves count.
      statuses.push(
        (await patch(owner, { sparkles: false, expectedUpdatedAt: null }))
          .status,
      );
    }
    expect(new Set(statuses)).toEqual(new Set([200]));
    await expectError(
      await putWidgets(owner, DEFAULT_ROOM_WIDGETS, null),
      429,
      'RATE_LIMITED',
    );
    await expectError(
      await tools.as(owner).put('/me/room/top-friends', {
        userIds: [],
        size: 8,
        visibility: 'friends',
        expectedUpdatedAt: null,
      }),
      429,
      'RATE_LIMITED',
    );
  });
});
