import { HttpStatus } from '@nestjs/common';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { MediaAssetId, UserId } from '@paldora/domain';
import type { ObjectStorage, StoredObject } from '@paldora/storage';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AvatarService } from '../src/avatar.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { UserService } from '../src/user.service.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('avatar upload flow', () => {
  let connection: DatabaseConnection;
  let service: AvatarService;
  let storage: TestObjectStorage;
  let userIds: [UserId, UserId];
  const mediaIds: MediaAssetId[] = [];
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [`avatar-${marker}-owner`, `avatar-${marker}-other`];

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
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
    const [owner, other] = inserted;
    if (!owner || !other) throw new Error('Avatar test users are missing.');
    userIds = [owner.id as UserId, other.id as UserId];
    await connection.database.insert(profiles).values(
      inserted.map(({ id }, index) => ({
        userId: id,
        username: `avatar_${marker}_${index}`,
        usernameNormalized: `avatar_${marker}_${index}`,
        displayName: `Avatar User ${index}`,
        onboardingState: 'complete' as const,
      })),
    );
  });

  beforeEach(() => {
    storage = new TestObjectStorage();
    const infrastructure = {
      databaseClient: connection.database,
    } as InfrastructureService;
    const avatarUrls = new ProfileAvatarService(infrastructure, storage);
    const usersService = new UserService(infrastructure, avatarUrls);
    service = new AvatarService(infrastructure, usersService, storage);
  });

  afterAll(async () => {
    if (mediaIds.length > 0) {
      await connection.database
        .delete(mediaJobOutbox)
        .where(inArray(mediaJobOutbox.mediaAssetId, mediaIds));
    }
    await connection.database.delete(users).where(inArray(users.id, userIds));
    await connection.close();
  });

  it('marks an upload failed when storage cannot create a signed request', async () => {
    storage.createUploadError = new Error('storage offline');
    const [owner] = userIds;
    await expect(
      service.createUpload(owner, {
        contentType: 'image/png',
        contentLength: 128,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { error: { code: 'STORAGE_UNAVAILABLE' } },
    });
    const [failed] = await connection.database
      .select({ id: mediaAssets.id, status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerUserId, owner))
      .orderBy(mediaAssets.createdAt)
      .limit(1);
    if (!failed) throw new Error('Failed upload row is missing.');
    mediaIds.push(failed.id as MediaAssetId);
    expect(failed.status).toBe('failed');
  });

  it('hides another user upload and preserves it as pending', async () => {
    const [owner, other] = userIds;
    const asset = await insertPendingAvatar(owner, 'ownership');
    storage.inspected = { contentType: 'image/png', contentLength: 128 };
    await expect(service.completeUpload(other, asset)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'AVATAR_UPLOAD_NOT_FOUND' } },
    });
    await expect(assetStatus(asset)).resolves.toBe('pending');
  });

  it('atomically replaces the profile avatar and records old-object cleanup', async () => {
    const [owner] = userIds;
    const oldAvatar = await insertReadyAvatar(owner, 'old');
    await connection.database
      .update(profiles)
      .set({ avatarMediaId: oldAvatar })
      .where(eq(profiles.userId, owner));
    const replacement = await insertPendingAvatar(owner, 'replacement');
    storage.inspected = { contentType: 'image/png', contentLength: 128 };

    await expect(
      service.completeUpload(owner, replacement),
    ).resolves.toMatchObject({
      profile: { avatarUrl: expect.stringContaining('replacement.png') },
    });
    await expect(currentAvatar(owner)).resolves.toBe(replacement);
    await expect(
      connection.database
        .select({ payload: mediaJobOutbox.payload })
        .from(mediaJobOutbox)
        .where(eq(mediaJobOutbox.mediaAssetId, oldAvatar)),
    ).resolves.toEqual([
      {
        payload: {
          mediaAssetId: oldAvatar,
          objectKeys: [objectKey(owner, 'old')],
        },
      },
    ]);
  });

  it('allows only one concurrent completion to claim an upload', async () => {
    const [owner] = userIds;
    const asset = await insertPendingAvatar(owner, 'concurrent');
    storage.inspected = { contentType: 'image/png', contentLength: 128 };
    const results = await Promise.allSettled([
      service.completeUpload(owner, asset),
      service.completeUpload(owner, asset),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const [rejected] = results.filter(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
      reason: {
        status: HttpStatus.CONFLICT,
        response: { error: { code: 'AVATAR_UPLOAD_ALREADY_HANDLED' } },
      },
    });
    await expect(currentAvatar(owner)).resolves.toBe(asset);
  });

  it('leaves the upload pending when storage verification fails', async () => {
    const [owner] = userIds;
    const asset = await insertPendingAvatar(owner, 'inspect-failure');
    storage.inspectError = new Error('head failed');
    await expect(service.completeUpload(owner, asset)).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { error: { code: 'STORAGE_UNAVAILABLE' } },
    });
    await expect(assetStatus(asset)).resolves.toBe('pending');
  });

  async function insertPendingAvatar(
    owner: UserId,
    suffix: string,
  ): Promise<MediaAssetId> {
    return insertAvatar(owner, suffix, 'pending');
  }

  async function insertReadyAvatar(
    owner: UserId,
    suffix: string,
  ): Promise<MediaAssetId> {
    return insertAvatar(owner, suffix, 'ready');
  }

  async function insertAvatar(
    owner: UserId,
    suffix: string,
    status: 'pending' | 'ready',
  ): Promise<MediaAssetId> {
    const [asset] = await connection.database
      .insert(mediaAssets)
      .values({
        ownerUserId: owner,
        objectKey: objectKey(owner, suffix),
        contentType: 'image/png',
        contentLength: 128,
        status,
      })
      .returning({ id: mediaAssets.id });
    if (!asset) throw new Error('Avatar test asset is missing.');
    const id = asset.id as MediaAssetId;
    mediaIds.push(id);
    return id;
  }

  async function assetStatus(mediaAssetId: MediaAssetId) {
    const [asset] = await connection.database
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId));
    return asset?.status;
  }

  async function currentAvatar(owner: UserId) {
    const [profile] = await connection.database
      .select({ avatarMediaId: profiles.avatarMediaId })
      .from(profiles)
      .where(eq(profiles.userId, owner));
    return profile?.avatarMediaId;
  }

  function objectKey(owner: UserId, suffix: string): string {
    return `avatars/${owner}/${marker}-${suffix}.png`;
  }
});

class TestObjectStorage implements ObjectStorage {
  public createUploadError: Error | undefined;
  public inspectError: Error | undefined;
  public inspected: StoredObject | null = null;

  public async createSignedUpload() {
    if (this.createUploadError) throw this.createUploadError;
    return {
      url: 'https://uploads.example.test/avatar',
      headers: { 'content-type': 'image/png' },
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  public createSignedDownload(objectKey: string): Promise<string> {
    return Promise.resolve(`signed:${objectKey}`);
  }

  public deleteObject(): Promise<void> {
    return Promise.resolve();
  }

  public async inspectObject(): Promise<StoredObject | null> {
    if (this.inspectError) throw this.inspectError;
    return this.inspected;
  }

  public readObject(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }

  public writeObject(): Promise<void> {
    return Promise.resolve();
  }
}
