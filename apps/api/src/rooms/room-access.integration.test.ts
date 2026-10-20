import { mediaAssets, users } from '@paldora/database';
import { DEFAULT_ROOM, DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { roomSchema, type RoomView } from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../testing/http.js';
import { roomTools } from '../testing/rooms.js';
import {
  createTestApp,
  uniqueUsername,
  type TestApp,
  type TestUser,
} from '../testing/test-app.js';

/**
 * Who sees a Room (plan §D): one access query, one ROOM_NOT_FOUND for every
 * denial, tiers hidden ⊂ friends ⊂ members, blocks either way. Each test
 * builds its own people, so the file is hermetic against leftover rows.
 */
let app: TestApp;
let tools: ReturnType<typeof roomTools>;
beforeAll(async () => {
  app = await createTestApp();
  tools = roomTools(app);
});
afterAll(() => app.close());

type Visibility = 'friends' | 'members' | 'hidden';

async function ownerWith(visibility: Visibility) {
  const owner = await app.person('owner');
  if (visibility !== DEFAULT_ROOM.visibility) {
    await tools.patchRoom(owner, { visibility });
  }
  return owner;
}

/** The relationship the viewer gets, or `null` for ROOM_NOT_FOUND. */
async function outcome(viewer: TestUser, owner: TestUser) {
  const response = await tools.roomOf(viewer, owner.username);
  if (response.status === 404) {
    await expectError(response, 404, 'ROOM_NOT_FOUND');
    return null;
  }
  return roomSchema.parse(await json(response)).relationship;
}

const visibilities: Visibility[] = ['friends', 'members', 'hidden'];

describe('the access matrix', () => {
  it.each(visibilities)('the owner always sees their %s Room', async (v) => {
    const owner = await ownerWith(v);
    expect(await outcome(owner, owner)).toBe('owner');
  });

  it.each([
    ['friends', 'friend'],
    ['members', 'friend'],
    ['hidden', null],
  ] as const)('an accepted friend, visibility %s: %s', async (v, expected) => {
    const [owner, friend] = [await ownerWith(v), await app.person('friend')];
    await tools.befriend(owner, friend);
    expect(await outcome(friend, owner)).toBe(expected);
  });

  it.each([
    ['friends', null],
    ['members', 'member'],
    ['hidden', null],
  ] as const)('a Box co-member, visibility %s: %s', async (v, expected) => {
    const [owner, member] = [await ownerWith(v), await app.person('member')];
    await tools.sharedBox(owner, member);
    expect(await outcome(member, owner)).toBe(expected);
  });

  it('counts a shared Box that is archived, whoever made it', async () => {
    const [owner, member] = [
      await ownerWith('members'),
      await app.person('member'),
    ];
    const box = await tools.sharedBox(member, owner);
    await json(
      await tools.as(member).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    expect(await outcome(member, owner)).toBe('member');
  });

  it.each(visibilities)(
    'a stranger never sees a %s Room',
    async (visibility) => {
      const [owner, stranger] = [
        await ownerWith(visibility),
        await app.person('stranger'),
      ];
      expect(await outcome(stranger, owner)).toBeNull();
    },
  );

  it('treats a pending or declined request as a stranger', async () => {
    const [owner, asker, declined] = [
      await ownerWith('members'),
      await app.person('asker'),
      await app.person('declined'),
    ];
    await json(
      await tools
        .as(asker)
        .post('/friend-requests', { username: owner.username }),
      201,
    );
    const sent = (await json(
      await tools
        .as(declined)
        .post('/friend-requests', { username: owner.username }),
      201,
    )) as { id: string };
    await ok(await tools.as(owner).post(`/friend-requests/${sent.id}/decline`));
    expect(await outcome(asker, owner)).toBeNull();
    expect(await outcome(declined, owner)).toBeNull();
  });

  it.each([
    ['leaves', 'left'],
    ['is removed', 'removed'],
    ['sees the Box deleted', 'deleted'],
  ] as const)(
    'a former member who %s loses a members Room at once',
    async (_case, how) => {
      const [owner, member] = [
        await ownerWith('members'),
        await app.person('member'),
      ];
      const box = await tools.sharedBox(owner, member);
      expect(await outcome(member, owner)).toBe('member');
      if (how === 'left') {
        await ok(await tools.as(member).delete(`/boxes/${box.id}/members/me`));
      } else if (how === 'removed') {
        await ok(
          await tools.as(owner).delete(`/boxes/${box.id}/members/${member.id}`),
        );
      } else {
        await ok(
          await tools
            .as(owner)
            .delete(`/boxes/${box.id}?confirmName=${box.name}`),
        );
      }
      expect(await outcome(member, owner)).toBeNull();
    },
  );

  it('an ex-friend keeps a members Room only while a Box is shared', async () => {
    const [owner, friend, other] = [
      await ownerWith('friends'),
      await app.person('friend'),
      await app.person('other'),
    ];
    await tools.befriend(owner, friend);
    await tools.befriend(owner, other);
    await tools.sharedBox(owner, other);
    await ok(await tools.as(owner).delete(`/friends/${friend.id}`));
    await ok(await tools.as(other).delete(`/friends/${owner.id}`));
    expect(await outcome(friend, owner)).toBeNull();
    expect(await outcome(other, owner)).toBeNull();
    await tools.patchRoom(owner, { visibility: 'members' });
    expect(await outcome(friend, owner)).toBeNull();
    expect(await outcome(other, owner)).toBe('member');
  });

  it.each(['owner blocks', 'viewer blocks', 'both block'] as const)(
    'a block (%s) hides the Room from both, at every tier',
    async (direction) => {
      const [owner, viewer] = [
        await ownerWith('members'),
        await app.person('viewer'),
      ];
      await tools.befriend(owner, viewer);
      await tools.sharedBox(owner, viewer);
      if (direction !== 'viewer blocks') await tools.block(owner, viewer);
      if (direction !== 'owner blocks') await tools.block(viewer, owner);
      expect(await outcome(viewer, owner)).toBeNull();
      expect(await outcome(owner, viewer)).toBeNull();
      // The owner still sees their own.
      expect(await outcome(owner, owner)).toBe('owner');
    },
  );

  it('an unblock restores the normal rules, with no memory of the block', async () => {
    const [owner, viewer] = [
      await ownerWith('members'),
      await app.person('viewer'),
    ];
    await tools.sharedBox(owner, viewer);
    await tools.block(viewer, owner);
    expect(await outcome(viewer, owner)).toBeNull();
    await ok(await tools.as(viewer).delete(`/blocks/${owner.id}`));
    expect(await outcome(viewer, owner)).toBe('member');
  });

  it('a suspended owner’s Room is not found, even for friends', async () => {
    const [owner, friend] = [
      await ownerWith('friends'),
      await app.person('friend'),
    ];
    await tools.befriend(owner, friend);
    await app.database
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, owner.id));
    expect(await outcome(friend, owner)).toBeNull();
  });

  it('a person without a username has no Room yet', async () => {
    const unnamed = await app.createUser();
    await expectError(
      await tools.as(unnamed).get('/me/room'),
      404,
      'ROOM_NOT_FOUND',
    );
    await expectError(
      await tools.as(unnamed).patch('/me/room', {
        sparkles: true,
        expectedUpdatedAt: null,
      }),
      404,
      'ROOM_NOT_FOUND',
    );
  });

  it('resolves case variants and follows a rename (the old URL is gone)', async () => {
    const [owner, friend] = [
      await ownerWith('friends'),
      await app.person('friend'),
    ];
    await tools.befriend(owner, friend);
    const shouted = await tools.roomOf(friend, owner.username.toUpperCase());
    expect(roomSchema.parse(await json(shouted)).owner.id).toBe(owner.id);
    const renamed = uniqueUsername('renamed');
    await json(
      await tools.as(owner).patch('/me/profile', { username: renamed }),
    );
    await expectError(
      await tools.roomOf(friend, owner.username),
      404,
      'ROOM_NOT_FOUND',
    );
    const room = roomSchema.parse(
      await json(await tools.roomOf(friend, renamed)),
    );
    expect(room.owner).toMatchObject({ id: owner.id, username: renamed });
  });

  it.each([
    ['a guessed name', () => uniqueUsername('nobody')],
    ['an over-long name', () => 'x'.repeat(150)],
    ['punctuation', () => '../me'],
    ['a UUID', () => randomUUID()],
    ['whitespace', () => '   '],
  ])('%s is ROOM_NOT_FOUND, never a validation error', async (_name, make) => {
    const viewer = await app.person('viewer');
    await expectError(
      await tools.roomOf(viewer, make()),
      404,
      'ROOM_NOT_FOUND',
    );
  });

  it('requires a signed-in viewer', async () => {
    const owner = await app.person('owner');
    await expectError(
      await app.request(null, `/rooms/${owner.username}`),
      401,
      'AUTHENTICATION_REQUIRED',
    );
  });
});

describe('denial parity', () => {
  /** Status, headers, and body, minus what differs on every request. */
  async function shape(response: Response) {
    const headers = Object.fromEntries(
      [...response.headers.entries()].filter(
        // The request ID, the clock, and the ETag (a hash of a body that
        // carries the request ID) differ between any two responses.
        ([name]) => !['x-request-id', 'date', 'etag'].includes(name),
      ),
    );
    const body = (await response.json()) as {
      error: { requestId?: string };
    };
    expect(body.error.requestId).toEqual(expect.any(String));
    delete body.error.requestId;
    return { status: response.status, headers, body };
  }

  it('answers every denial reason byte-identically', async () => {
    const viewer = await app.person('viewer');
    const make = async (prepare: (owner: TestUser) => Promise<void>) => {
      const owner = await app.person('owner');
      await prepare(owner);
      return owner.username;
    };
    const renamedFrom = await make(async (owner) => {
      await tools.befriend(owner, viewer);
      await json(
        await tools
          .as(owner)
          .patch('/me/profile', { username: uniqueUsername('moved') }),
      );
    });
    const names = {
      missing: uniqueUsername('missing'),
      malformed: '%%%'.repeat(40),
      stranger: await make(() => Promise.resolve()),
      hidden: await make(async (owner) => {
        await tools.befriend(owner, viewer);
        await tools.patchRoom(owner, { visibility: 'hidden' });
      }),
      membersOnlyFriendsTier: await make(async (owner) => {
        await tools.sharedBox(owner, viewer);
      }),
      ownerBlocked: await make(async (owner) => {
        await tools.befriend(owner, viewer);
        await tools.block(owner, viewer);
      }),
      viewerBlocked: await make(async (owner) => {
        await tools.befriend(owner, viewer);
        await tools.block(viewer, owner);
      }),
      suspended: await make(async (owner) => {
        await tools.befriend(owner, viewer);
        await app.database
          .update(users)
          .set({ status: 'suspended' })
          .where(eq(users.id, owner.id));
      }),
      renamed: renamedFrom,
    };
    const shapes = await Promise.all(
      Object.values(names).map(async (name) =>
        shape(await tools.roomOf(viewer, name)),
      ),
    );
    expect(shapes[0]?.status).toBe(404);
    for (const each of shapes) expect(each).toEqual(shapes[0]);
  });
});

describe('roomless defaults', () => {
  it('serves the default Room without writing a row', async () => {
    const [owner, friend] = [await app.person('owner'), await app.person('f')];
    await tools.befriend(owner, friend);
    const mine = await tools.myRoom(owner);
    expect(mine).toMatchObject({
      relationship: 'owner',
      visibility: DEFAULT_ROOM.visibility,
      updatedAt: null,
      style: {
        themePreset: DEFAULT_ROOM.themePreset,
        layout: DEFAULT_ROOM.layout,
        accent: null,
        font: null,
        decorationPack: null,
        sparkles: false,
      },
      topFriends: {
        size: DEFAULT_ROOM.topFriendsSize,
        visibility: DEFAULT_ROOM.topFriendsVisibility,
        items: [],
      },
      banner: null,
      music: null,
      configurationVersion: 1,
    });
    expect(mine.widgets).toEqual(DEFAULT_ROOM_WIDGETS);
    const visited = await tools.visit(friend, owner);
    expect(visited.relationship).toBe('friend');
    expect(visited.widgets).toEqual(DEFAULT_ROOM_WIDGETS);
    // Still no row: the owner's version is still null after the reads.
    expect((await tools.myRoom(owner)).updatedAt).toBeNull();
  });

  it('the first write needs expectedUpdatedAt null; a second tab is stale', async () => {
    const owner = await app.person('owner');
    await expectError(
      await tools.as(owner).patch('/me/room', {
        sparkles: true,
        expectedUpdatedAt: '2026-10-20T10:00:00.000000Z',
      }),
      409,
      'ROOM_UPDATE_STALE',
    );
    const saved = roomSchema.parse(
      await json(
        await tools
          .as(owner)
          .patch('/me/room', { sparkles: true, expectedUpdatedAt: null }),
      ),
    );
    expect(saved.updatedAt).toMatch(/^\d{4}-.*\.\d{6}Z$/);
    await expectError(
      await tools
        .as(owner)
        .patch('/me/room', { layout: 'single', expectedUpdatedAt: null }),
      409,
      'ROOM_UPDATE_STALE',
    );
  });
});

describe('visitor shaping', () => {
  async function customized() {
    const [owner, friend, top] = [
      await app.person('owner'),
      await app.person('friend'),
      await app.person('top'),
    ];
    await tools.befriend(owner, friend);
    await tools.befriend(owner, top);
    const banner = await tools.readyBanner(owner);
    await tools.patchRoom(owner, {
      bannerMediaId: banner.id,
      currently: 'Reading',
      music: { url: 'https://music.example.com/song', title: 'Song' },
    });
    const widgets = DEFAULT_ROOM_WIDGETS.map((widget) =>
      widget.type === 'photos' ? { ...widget, enabled: false } : widget,
    );
    const { updatedAt } = await tools.myRoom(owner);
    await json(
      await tools
        .as(owner)
        .put('/me/room/widgets', { widgets, expectedUpdatedAt: updatedAt }),
    );
    await json(
      await tools.setTopFriends(owner, [top], { visibility: 'visible' }),
    );
    return { owner, friend, top, banner };
  }

  it('gives the owner every field and visitors none of the owner-only ones', async () => {
    const { owner, friend, top, banner } = await customized();
    const mine = await tools.myRoom(owner);
    expect(mine.visibility).toBe('friends');
    expect(mine.updatedAt).not.toBeNull();
    expect(mine.banner).toEqual({
      url: expect.stringContaining(
        encodeURIComponent(`media/${banner.id}/display.webp`),
      ),
      bannerMediaId: banner.id,
    });
    expect(mine.widgets).toHaveLength(7);
    expect(mine.topFriends).toMatchObject({ size: 8, visibility: 'visible' });

    const theirs: RoomView = await tools.visit(friend, owner);
    expect(theirs.relationship).toBe('friend');
    expect(theirs.visibility).toBeNull();
    expect(theirs.updatedAt).toBeNull();
    expect(theirs.banner).toEqual({
      url: expect.stringContaining('display.webp'),
      bannerMediaId: null,
    });
    expect(theirs.widgets.map((widget) => widget.type)).not.toContain('photos');
    expect(theirs.widgets.every((widget) => widget.enabled)).toBe(true);
    expect(theirs.topFriends).toEqual({
      size: null,
      visibility: null,
      items: [expect.objectContaining({ id: top.id })],
    });
    expect(theirs.currently).toBe('Reading');
    expect(theirs.music).toEqual({
      url: 'https://music.example.com/song',
      title: 'Song',
      artist: null,
    });
    // No signed URL for the master or the raw upload ever leaves the API.
    const text = JSON.stringify(theirs);
    expect(text).not.toContain('master.webp');
    expect(text).not.toContain('uploads/');
  });

  it.each(['processing', 'deleted'] as const)(
    'serves no banner while its asset is %s',
    async (status) => {
      const { owner, friend, banner } = await customized();
      await app.database
        .update(mediaAssets)
        .set({ status })
        .where(eq(mediaAssets.id, banner.id));
      expect((await tools.visit(friend, owner)).banner).toBeNull();
      expect((await tools.myRoom(owner)).banner).toBeNull();
    },
  );
});
