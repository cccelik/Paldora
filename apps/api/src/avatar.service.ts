import {
  HttpStatus,
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { mediaAssets, profiles } from '@paldora/database';
import type {
  CreateAvatarUploadInput,
  CreateAvatarUploadResult,
  MediaAssetId,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Injectable()
export class AvatarService implements OnApplicationShutdown {
  private readonly redisUrl = new URL(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  private readonly queue = new Queue('paldora-jobs', {
    connection: {
      host: this.redisUrl.hostname,
      port: Number(this.redisUrl.port || 6379),
      ...(this.redisUrl.username ? { username: this.redisUrl.username } : {}),
      ...(this.redisUrl.password ? { password: this.redisUrl.password } : {}),
      ...(this.redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
    },
  });

  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(UserService)
    private readonly users: UserService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async createUpload(
    userId: UserId,
    input: CreateAvatarUploadInput,
  ): Promise<CreateAvatarUploadResult> {
    const suffix = input.contentType.split('/')[1] ?? 'image';
    const objectKey = `avatars/${userId}/${randomUUID()}.${suffix}`;
    const [asset] = await this.infrastructure.databaseClient
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        objectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
      })
      .returning();
    if (!asset) throw new Error('Media asset insert returned no row.');
    try {
      const upload = await this.storage.createSignedUpload({
        objectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
        expiresInSeconds: 300,
      });
      return {
        mediaAsset: this.users.mapMediaAsset(asset),
        upload: {
          ...upload,
          expiresAt: upload.expiresAt.toISOString(),
        },
      };
    } catch {
      await this.infrastructure.databaseClient
        .update(mediaAssets)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(mediaAssets.id, asset.id));
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'STORAGE_UNAVAILABLE',
        'The profile photo upload could not be prepared.',
      );
    }
  }

  public async completeUpload(
    userId: UserId,
    mediaAssetId: MediaAssetId,
  ): Promise<ReturnType<UserService['getCurrentUser']>> {
    const [asset] = await this.infrastructure.databaseClient
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.status, 'pending'),
        ),
      )
      .limit(1);
    if (!asset) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'AVATAR_UPLOAD_NOT_FOUND',
        'That profile photo upload is not available.',
      );
    }
    const stored = await this.storage.inspectObject(asset.objectKey);
    if (
      !stored ||
      stored.contentType !== asset.contentType ||
      stored.contentLength !== asset.contentLength
    ) {
      await this.infrastructure.databaseClient
        .update(mediaAssets)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(mediaAssets.id, asset.id));
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_AVATAR_UPLOAD',
        'The uploaded profile photo did not match the signed request.',
      );
    }
    const oldAsset = await this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const [profile] = await transaction
          .select({ avatarMediaId: profiles.avatarMediaId })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);
        await transaction
          .update(mediaAssets)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(mediaAssets.id, asset.id));
        await transaction
          .update(profiles)
          .set({ avatarMediaId: asset.id, updatedAt: new Date() })
          .where(eq(profiles.userId, userId));
        if (!profile?.avatarMediaId) return null;
        const [old] = await transaction
          .select({ id: mediaAssets.id, objectKey: mediaAssets.objectKey })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, profile.avatarMediaId))
          .limit(1);
        return old ?? null;
      },
    );
    if (oldAsset && oldAsset.id !== asset.id) {
      await this.queue.add(
        'delete-media-object',
        { mediaAssetId: oldAsset.id, objectKey: oldAsset.objectKey },
        { attempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
      );
    }
    return this.users.getCurrentUser(userId, this.storage);
  }

  public async deleteAvatar(
    userId: UserId,
  ): Promise<ReturnType<UserService['getCurrentUser']>> {
    const [profile] = await this.infrastructure.databaseClient
      .select({ avatarMediaId: profiles.avatarMediaId })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    if (profile?.avatarMediaId) {
      const [asset] = await this.infrastructure.databaseClient
        .select({ id: mediaAssets.id, objectKey: mediaAssets.objectKey })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, profile.avatarMediaId))
        .limit(1);
      await this.infrastructure.databaseClient
        .update(profiles)
        .set({ avatarMediaId: null, updatedAt: new Date() })
        .where(eq(profiles.userId, userId));
      if (asset)
        await this.queue.add('delete-media-object', {
          mediaAssetId: asset.id,
          objectKey: asset.objectKey,
        });
    }
    return this.users.getCurrentUser(userId, this.storage);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
