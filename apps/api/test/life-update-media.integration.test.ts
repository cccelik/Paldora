import { HttpStatus } from '@nestjs/common';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { UserId } from '@paldora/domain';
import type { ObjectStorage, StoredObject } from '@paldora/storage';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { LifeUpdateMediaService } from '../src/life-update-media.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import type { RoomService } from '../src/room.service.js';
import { UserService } from '../src/user.service.js';
import { createFakeObjectStorage } from './fake-object-storage.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Life Update media reservations', () => {
  let connection: DatabaseConnection;
  let infrastructure: InfrastructureService;
  let userIds: UserId[];
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [`life-media-${marker}-owner`, `life-media-${marker}-other`];

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
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
    userIds = inserted.map(({ id }) => id as UserId);
    await connection.database.insert(profiles).values(
      inserted.map(({ id }, index) => ({
        userId: id,
        username: `life_media_${marker}_${index}`,
        usernameNormalized: `life_media_${marker}_${index}`,
        onboardingState: 'complete' as const,
      })),
    );
  });

  afterAll(async () => {
    await connection.pool.query(
      'delete from paldora.users where auth_subject = any($1::text[])',
      [subjects],
    );
    await connection.close();
  });

  it('enforces ownership and completes a verified upload exactly once', async () => {
    const [owner, other] = requiredUsers(userIds);
    const stored = new Map<string, StoredObject>();
    const service = createService(storageWith(stored));
    const upload = await service.createUpload(owner, {
      contentType: 'image/png',
      contentLength: 128,
    });
    await expect(
      service.completeUpload(other, upload.mediaAsset.id),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'LIFE_UPDATE_MEDIA_UPLOAD_NOT_FOUND' } },
    });
    stored.set(new URL(upload.upload.url).pathname.slice(1), {
      contentType: 'image/png',
      contentLength: 128,
    });
    const completions = await Promise.allSettled([
      service.completeUpload(owner, upload.mediaAsset.id),
      service.completeUpload(owner, upload.mediaAsset.id),
    ]);
    expect(
      completions.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      completions.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      connection.database
        .select({ jobType: mediaJobOutbox.jobType })
        .from(mediaJobOutbox)
        .where(eq(mediaJobOutbox.mediaAssetId, upload.mediaAsset.id)),
    ).resolves.toEqual([{ jobType: 'process-post-image' }]);
  });

  it('marks invalid or unavailable storage reservations failed', async () => {
    const [owner] = requiredUsers(userIds);
    const invalidService = createService(storageWith(new Map()));
    const invalid = await invalidService.createUpload(owner, {
      contentType: 'image/webp',
      contentLength: 64,
    });
    await expect(
      invalidService.completeUpload(owner, invalid.mediaAsset.id),
    ).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { error: { code: 'INVALID_LIFE_UPDATE_MEDIA_UPLOAD' } },
    });

    const unavailable = createService({
      ...createFakeObjectStorage(),
      createSignedUpload: async () => {
        throw new Error('Storage unavailable.');
      },
    });
    await expect(
      unavailable.createUpload(owner, {
        contentType: 'image/jpeg',
        contentLength: 32,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { error: { code: 'STORAGE_UNAVAILABLE' } },
    });
    const failed = await connection.database
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.ownerUserId, owner),
          eq(mediaAssets.purpose, 'life_update_image'),
          eq(mediaAssets.status, 'failed'),
        ),
      );
    expect(failed.length).toBeGreaterThanOrEqual(2);
  });

  function createService(storage: ObjectStorage): LifeUpdateMediaService {
    const avatars = new ProfileAvatarService(infrastructure, storage);
    return new LifeUpdateMediaService(
      infrastructure,
      new UserService(infrastructure, avatars, {
        ensure: async () => undefined,
      } as unknown as RoomService),
      storage,
    );
  }
});

function storageWith(objects: Map<string, StoredObject>): ObjectStorage {
  return {
    ...createFakeObjectStorage(),
    createSignedUpload: async ({ objectKey, contentType }) => ({
      objectKey,
      url: `https://upload.invalid/${objectKey}`,
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + 300_000),
    }),
    inspectObject: async (objectKey) => objects.get(objectKey) ?? null,
  };
}

function requiredUsers(values: UserId[]): [UserId, UserId] {
  const [first, second] = values;
  if (!first || !second)
    throw new Error('Life Update media users are missing.');
  return [first, second];
}
