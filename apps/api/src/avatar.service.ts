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
  private readonly queue: Queue;

  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(UserService)
    private readonly users: UserService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    const redisUrlValue = process.env.REDIS_URL;
    if (!redisUrlValue) throw new Error('REDIS_URL is required');
    const redisUrl = new URL(redisUrlValue);
    this.queue = new Queue('paldora-jobs', {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.username ? { username: redisUrl.username } : {}),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
        ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
      },
    });
  }

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
    const oldMediaAssetId =
      await this.infrastructure.databaseClient.transaction(
        async (transaction) => {
          const [profile] = await transaction
            .select({ avatarMediaId: profiles.avatarMediaId })
            .from(profiles)
            .where(eq(profiles.userId, userId))
            .for('update')
            .limit(1);
          if (!profile) {
            throw new ApiError(
              HttpStatus.NOT_FOUND,
              'PROFILE_NOT_FOUND',
              'Profile not found.',
            );
          }
          const [claimed] = await transaction
            .update(mediaAssets)
            .set({ status: 'ready', updatedAt: new Date() })
            .where(
              and(
                eq(mediaAssets.id, asset.id),
                eq(mediaAssets.ownerUserId, userId),
                eq(mediaAssets.status, 'pending'),
              ),
            )
            .returning({ id: mediaAssets.id });
          if (!claimed) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'AVATAR_UPLOAD_ALREADY_HANDLED',
              'That profile photo upload was already handled.',
            );
          }
          await transaction
            .update(profiles)
            .set({ avatarMediaId: asset.id, updatedAt: new Date() })
            .where(eq(profiles.userId, userId));
          return profile.avatarMediaId;
        },
      );
    if (oldMediaAssetId && oldMediaAssetId !== asset.id) {
      await this.enqueueMediaDeletion(oldMediaAssetId);
    }
    return this.users.getCurrentUser(userId);
  }

  public async deleteAvatar(
    userId: UserId,
  ): Promise<ReturnType<UserService['getCurrentUser']>> {
    const mediaAssetId = await this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const [profile] = await transaction
          .select({ avatarMediaId: profiles.avatarMediaId })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .for('update')
          .limit(1);
        if (!profile?.avatarMediaId) return null;
        await transaction
          .update(profiles)
          .set({ avatarMediaId: null, updatedAt: new Date() })
          .where(eq(profiles.userId, userId));
        return profile.avatarMediaId;
      },
    );
    if (mediaAssetId) await this.enqueueMediaDeletion(mediaAssetId);
    return this.users.getCurrentUser(userId);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }

  private enqueueMediaDeletion(mediaAssetId: string): Promise<unknown> {
    return this.queue.add(
      'delete-media-object',
      { mediaAssetId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }
}
