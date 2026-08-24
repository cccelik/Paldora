import { HttpStatus } from '@nestjs/common';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  roomTopFriends,
  rooms,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { FriendshipId, UserId } from '@paldora/domain';
import type { ObjectStorage, StoredObject } from '@paldora/storage';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { RoomAuthorizationPolicy } from '../src/room-authorization-policy.service.js';
import { RoomBannerService } from '../src/room-banner.service.js';
import { RoomService } from '../src/room.service.js';
import { SocialService } from '../src/social.service.js';
import { UserService } from '../src/user.service.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))(
  'Room privacy and personalization flow',
  () => {
    let connection: DatabaseConnection;
    let roomService: RoomService;
    let social: SocialService;
    let banners: RoomBannerService;
    let storage: RoomTestStorage;
    let userIds: [UserId, UserId, UserId, UserId];
    const marker = randomUUID().replaceAll('-', '').slice(0, 12);
    const subjects = Array.from(
      { length: 4 },
      (_, index) => `room-${marker}-${index}`,
    );
    const usernames = subjects.map((_, index) => `room_${marker}_${index}`);

    beforeAll(async () => {
      connection = createDatabaseConnection(databaseUrl as string);
      const infrastructure = {
        databaseClient: connection.database,
      } as InfrastructureService;
      storage = new RoomTestStorage();
      const avatars = new ProfileAvatarService(infrastructure, storage);
      const policy = new RoomAuthorizationPolicy(infrastructure);
      roomService = new RoomService(infrastructure, policy, avatars, storage);
      const usersService = new UserService(
        infrastructure,
        avatars,
        roomService,
      );
      banners = new RoomBannerService(
        infrastructure,
        usersService,
        roomService,
        storage,
      );
      social = new SocialService(infrastructure, avatars);
      const inserted = await connection.database
        .insert(users)
        .values(
          subjects.map((subject) => ({
            authSubject: subject,
            email: `${subject}@example.com`,
            emailNormalized: `${subject}@example.com`,
          })),
        )
        .returning({ id: users.id });
      if (inserted.length !== 4)
        throw new Error('Room test users are missing.');
      userIds = inserted.map(({ id }) => id) as [
        UserId,
        UserId,
        UserId,
        UserId,
      ];
      await connection.database.insert(profiles).values(
        inserted.map(({ id }, index) => ({
          userId: id,
          username: usernames[index],
          usernameNormalized: usernames[index],
          displayName: `Room Friend ${index}`,
          onboardingState: 'complete' as const,
        })),
      );
      await Promise.all(userIds.map((id) => roomService.ensure(id)));
    });

    afterAll(async () => {
      await connection.database.delete(users).where(inArray(users.id, userIds));
      await connection.close();
    });

    it('defaults to Cream Paper and conceals every inaccessible state', async () => {
      const [owner, friend, member] = userIds;
      await expect(roomService.mine(owner)).resolves.toMatchObject({
        visibility: 'friends',
        themePreset: 'cream_paper',
        widgets: expect.arrayContaining([
          expect.objectContaining({ type: 'posts' }),
        ]),
      });
      await expect(
        roomService.view(member, usernames[0]!),
      ).rejects.toMatchObject(roomNotFound());
      const request = await social.request(owner, usernames[1]!);
      await social.respond(friend, request.id as FriendshipId, 'accepted');
      await expect(
        roomService.view(friend, usernames[0]!),
      ).resolves.toMatchObject({ viewerRelationship: 'friend' });
      const friendsRoom = await roomService.mine(owner);
      await roomService.update(owner, {
        visibility: 'members',
        expectedUpdatedAt: friendsRoom.updatedAt,
      });
      await expect(
        roomService.view(member, usernames[0]!),
      ).resolves.toMatchObject({ viewerRelationship: 'member' });
      const membersRoom = await roomService.mine(owner);
      await roomService.update(owner, {
        visibility: 'hidden',
        expectedUpdatedAt: membersRoom.updatedAt,
      });
      await expect(
        roomService.view(friend, usernames[0]!),
      ).rejects.toMatchObject(roomNotFound());
      await expect(
        roomService.view(member, usernames[0]!),
      ).rejects.toMatchObject(roomNotFound());
      await expect(
        roomService.view(owner, usernames[0]!),
      ).resolves.toMatchObject({ viewerRelationship: 'owner' });
    });

    it('rejects stale writes and saves a complete widget order atomically', async () => {
      const [owner] = userIds;
      const initial = await roomService.mine(owner);
      const saved = await roomService.update(owner, {
        visibility: 'friends',
        themePreset: 'ocean_glow',
        expectedUpdatedAt: initial.updatedAt,
      });
      await expect(
        roomService.update(owner, {
          layout: 'single',
          expectedUpdatedAt: initial.updatedAt,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { error: { code: 'ROOM_UPDATE_STALE' } },
      });
      const reversed = [...saved.widgets]
        .reverse()
        .map((widget, position) => ({ ...widget, position }));
      await expect(
        roomService.updateWidgets(owner, {
          widgets: reversed,
          expectedUpdatedAt: saved.updatedAt,
        }),
      ).resolves.toMatchObject({
        widgets: reversed,
      });
    });

    it('permits active accepted Top Friends and removes references with the relationship', async () => {
      const [owner, friend, member, secondFriend] = userIds;
      const request = await social.request(owner, usernames[3]!);
      await social.respond(
        secondFriend,
        request.id as FriendshipId,
        'accepted',
      );
      const current = await roomService.mine(owner);
      await expect(
        roomService.updateTopFriends(owner, {
          userIds: [friend, secondFriend],
          size: 4,
          visibility: 'friends',
          expectedUpdatedAt: current.updatedAt,
        }),
      ).resolves.toMatchObject({
        topFriends: [{ userId: friend }, { userId: secondFriend }],
      });
      const updated = await roomService.mine(owner);
      await expect(
        roomService.updateTopFriends(owner, {
          userIds: [member],
          size: 4,
          visibility: 'visible',
          expectedUpdatedAt: updated.updatedAt,
        }),
      ).rejects.toMatchObject({
        response: { error: { code: 'TOP_FRIEND_NOT_ELIGIBLE' } },
      });
      await social.remove(owner, secondFriend);
      await expect(selectedTopFriends(owner)).resolves.toEqual([friend]);
      await social.block(owner, usernames[1]!);
      await expect(selectedTopFriends(owner)).resolves.toEqual([]);
      await expect(
        roomService.view(friend, usernames[0]!),
      ).rejects.toMatchObject(roomNotFound());
    });

    it('verifies, attaches, replaces, and cleans up private Room banners', async () => {
      const [owner, , member] = userIds;
      const first = await banners.createUpload(owner, {
        contentType: 'image/png',
        contentLength: 128,
      });
      storage.inspected = { contentType: 'image/png', contentLength: 128 };
      await expect(
        banners.completeUpload(member, first.mediaAsset.id),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      await banners.completeUpload(owner, first.mediaAsset.id);
      await connection.database
        .update(mediaAssets)
        .set({ status: 'ready', displayObjectKey: 'room-banner-display.webp' })
        .where(eq(mediaAssets.id, first.mediaAsset.id));
      await expect(roomService.mine(owner)).resolves.toMatchObject({
        bannerUrl: 'signed:room-banner-display.webp',
      });
      const second = await banners.createUpload(owner, {
        contentType: 'image/webp',
        contentLength: 256,
      });
      storage.inspected = { contentType: 'image/webp', contentLength: 256 };
      await banners.completeUpload(owner, second.mediaAsset.id);
      await expect(
        connection.database
          .select({ id: mediaJobOutbox.mediaAssetId })
          .from(mediaJobOutbox)
          .where(
            and(
              eq(mediaJobOutbox.mediaAssetId, first.mediaAsset.id),
              eq(mediaJobOutbox.jobType, 'delete-media-object'),
            ),
          ),
      ).resolves.toHaveLength(1);
      await banners.delete(owner);
      await expect(
        connection.database
          .select({ banner: rooms.bannerMediaId })
          .from(rooms)
          .where(eq(rooms.userId, owner)),
      ).resolves.toEqual([{ banner: null }]);
    });

    async function selectedTopFriends(owner: UserId) {
      const rows = await connection.database
        .select({ id: roomTopFriends.friendUserId })
        .from(roomTopFriends)
        .where(eq(roomTopFriends.roomUserId, owner))
        .orderBy(roomTopFriends.position);
      return rows.map(({ id }) => id as UserId);
    }
  },
);

function roomNotFound() {
  return {
    status: HttpStatus.NOT_FOUND,
    response: { error: { code: 'ROOM_NOT_FOUND' } },
  };
}

class RoomTestStorage implements ObjectStorage {
  public inspected: StoredObject | null = null;
  public async createSignedUpload(input: { objectKey: string }) {
    return {
      method: 'PUT' as const,
      url: `upload:${input.objectKey}`,
      headers: {},
      expiresAt: new Date(Date.now() + 60_000),
    };
  }
  public async inspectObject() {
    return this.inspected;
  }
  public async createSignedDownload(objectKey: string) {
    return `signed:${objectKey}`;
  }
  public async deleteObject() {}
  public async readObject() {
    return new Uint8Array();
  }
  public async writeObject() {}
}
