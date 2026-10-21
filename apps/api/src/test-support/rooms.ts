import { mediaJobOutbox, type mediaAssets } from '@paldora/database';
import { readyMediaAsset } from '@paldora/database/testing';
import { roomSchema, type RoomView } from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { json } from './http.js';
import { scenes } from './scenes.js';
import type { TestApp, TestUser } from './test-app.js';

/**
 * Room tooling for API tests. Relationships and Room writes go through the
 * real API; only a processed banner is written straight to the database
 * (with its objects in the in-memory storage), standing in for the worker.
 */
export function roomTools(app: TestApp) {
  const { as, befriend, sharedBox } = scenes(app);
  async function block(blocker: TestUser, target: TestUser): Promise<void> {
    await scenes(app).block(blocker, target);
  }

  async function myRoom(user: TestUser): Promise<RoomView> {
    return roomSchema.parse(await json(await as(user).get('/me/room')));
  }

  const roomOf = (viewer: TestUser, username: string) =>
    as(viewer).get(`/rooms/${encodeURIComponent(username)}`);

  async function visit(viewer: TestUser, owner: TestUser): Promise<RoomView> {
    return roomSchema.parse(await json(await roomOf(viewer, owner.username)));
  }

  /** PATCH with the current version, read first. */
  async function patchRoom(
    user: TestUser,
    changes: Record<string, unknown>,
  ): Promise<RoomView> {
    const { updatedAt } = await myRoom(user);
    return roomSchema.parse(
      await json(
        await as(user).patch('/me/room', {
          ...changes,
          expectedUpdatedAt: updatedAt,
        }),
      ),
    );
  }

  async function setTopFriends(
    user: TestUser,
    friends: readonly TestUser[],
    options: { size?: 4 | 8 | 12; visibility?: string } = {},
  ): Promise<Response> {
    const { updatedAt } = await myRoom(user);
    return as(user).put('/me/room/top-friends', {
      userIds: friends.map((friend) => friend.id),
      size: options.size ?? 8,
      visibility: options.visibility ?? 'friends',
      expectedUpdatedAt: updatedAt,
    });
  }

  /** A processed `room_banner` of `user`, its objects in storage. */
  async function readyBanner(
    user: TestUser,
    overrides: Partial<typeof mediaAssets.$inferInsert> = {},
  ) {
    const { id, keys } = await readyMediaAsset(app.database, {
      ownerId: user.id,
      purpose: 'room_banner',
      height: 533,
      ...overrides,
    });
    for (const key of Object.values(keys)) {
      app.storage.put(key, 'image/webp', new Uint8Array([1, 2, 3]));
    }
    return { id, keys: Object.values(keys) };
  }

  /**
   * Stands in for the worker's deletion job: removes exactly the keys every
   * queued `media.delete` row names for this asset's objects, then returns
   * what is still stored under the asset.
   */
  async function drainDeletions(mediaAssetId: string): Promise<string[]> {
    const rows = await app.database
      .select({ payload: mediaJobOutbox.payload })
      .from(mediaJobOutbox)
      .where(
        and(
          eq(mediaJobOutbox.jobType, 'media.delete'),
          sql`${mediaJobOutbox.payload}::text like ${`%${mediaAssetId}%`}`,
        ),
      );
    await app.storage.delete(
      rows.flatMap(
        (row) => (row.payload as { objectKeys: string[] }).objectKeys,
      ),
    );
    return [...app.storage.objects.keys()].filter((key) =>
      key.includes(mediaAssetId),
    );
  }

  return {
    as,
    befriend,
    block,
    sharedBox,
    myRoom,
    roomOf,
    visit,
    patchRoom,
    setTopFriends,
    readyBanner,
    drainDeletions,
  };
}
