import { roomSchema } from '@paldora/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../test-support/http.js';
import { scenes } from '../test-support/scenes.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

/** ADR 013 block-direction matrix for Phase 7, including restoration and races. */
let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);

const block: ReturnType<typeof scenes>['block'] = (...args) =>
  scenes(app).block(...args);

const befriend: ReturnType<typeof scenes>['befriend'] = (...args) =>
  scenes(app).befriend(...args);

const sharedBox: ReturnType<typeof scenes>['sharedBox'] = (...args) =>
  scenes(app).sharedBox(...args);

describe('Rooms and Top Friends across a block (Phase 7)', () => {
  const room = (viewer: TestUser, owner: TestUser) =>
    as(viewer).get(`/rooms/${owner.username}`);
  const topFriendIds = async (viewer: TestUser, owner: TestUser) => {
    const body = roomSchema.parse(await json(await room(viewer, owner)));
    return body.topFriends.items?.map((item) => item.id) ?? null;
  };
  async function chooseTopFriends(owner: TestUser, friends: TestUser[]) {
    const { updatedAt } = roomSchema.parse(
      await json(await as(owner).get('/me/room')),
    );
    return as(owner).put('/me/room/top-friends', {
      userIds: friends.map((friend) => friend.id),
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: updatedAt,
    });
  }

  it.each([
    ['the owner blocks the viewer', 0],
    ['the viewer blocks the owner', 1],
  ])(
    'hides the Room from both people when %s; unblock restores, re-block hides',
    async (_case, index) => {
      const [owner, viewer] = [await app.person('o'), await app.person('v')];
      await befriend(owner, viewer);
      const box = await sharedBox(owner, viewer);
      const { updatedAt } = roomSchema.parse(
        await json(await as(owner).get('/me/room')),
      );
      await json(
        await as(owner).patch('/me/room', {
          visibility: 'members',
          expectedUpdatedAt: updatedAt,
        }),
      );
      const [from, target] = (
        index === 0 ? [owner, viewer] : [viewer, owner]
      ) as [TestUser, TestUser];
      const post = await scenes(app).say(owner, box.id, 'in the shared Box');
      // The Room and every preview route answer alike.
      const routes = ['', '/content', '/content/summary', '/photos'];
      const hidden = async (from: TestUser, of: TestUser) => {
        for (const path of routes) {
          await expectError(
            await as(from).get(`/rooms/${of.username}${path}`),
            404,
            'ROOM_NOT_FOUND',
          );
        }
      };
      await block(from, target);
      await hidden(viewer, owner);
      await hidden(owner, viewer);
      // The block ended the friendship; the shared Box admits them again.
      await ok(await as(from).delete(`/blocks/${target.id}`));
      expect(
        roomSchema.parse(await json(await room(viewer, owner))).relationship,
      ).toBe('member');
      const content = (await json(
        await as(viewer).get(`/rooms/${owner.username}/content`),
      )) as { items: { post?: { id: string } }[] };
      expect(content.items.map((item) => item.post?.id)).toEqual([post.id]);
      await block(from, target);
      await hidden(viewer, owner);
    },
  );

  it.each([
    ['the owner blocks the Top Friend', 0],
    ['the Top Friend blocks the owner', 1],
  ])(
    'removes the Top Friend when %s, and refuses re-adding',
    async (_c, index) => {
      const [owner, top] = [await app.person('o'), await app.person('t')];
      await befriend(owner, top);
      await json(await chooseTopFriends(owner, [top]));
      const [from, target] = (index === 0 ? [owner, top] : [top, owner]) as [
        TestUser,
        TestUser,
      ];
      await block(from, target);
      expect(await topFriendIds(owner, owner)).toEqual([]);
      await expectError(
        await chooseTopFriends(owner, [top]),
        422,
        'TOP_FRIEND_NOT_ELIGIBLE',
      );
      // Unblocking does not restore the friendship, so still not eligible.
      await ok(await as(from).delete(`/blocks/${target.id}`));
      await expectError(
        await chooseTopFriends(owner, [top]),
        422,
        'TOP_FRIEND_NOT_ELIGIBLE',
      );
    },
  );

  it.each([
    ['the visitor blocks the Top Friend', 0],
    ['the Top Friend blocks the visitor', 1],
  ])(
    'omits only that Top Friend for that visitor when %s',
    async (_c, index) => {
      const [owner, top, other, visitor] = await Promise.all([
        app.person('o'),
        app.person('t'),
        app.person('x'),
        app.person('v'),
      ]);
      await befriend(owner, top);
      await befriend(owner, other);
      await befriend(owner, visitor);
      await json(await chooseTopFriends(owner, [top, other]));
      const [from, target] = (
        index === 0 ? [visitor, top] : [top, visitor]
      ) as [TestUser, TestUser];
      await block(from, target);
      expect(await topFriendIds(visitor, owner)).toEqual([other.id]);
      expect(await topFriendIds(owner, owner)).toEqual([top.id, other.id]);
      await ok(await as(from).delete(`/blocks/${target.id}`));
      expect(await topFriendIds(visitor, owner)).toEqual([top.id, other.id]);
    },
  );
});
