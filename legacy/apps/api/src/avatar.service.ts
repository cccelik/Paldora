import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { mediaAssets, mediaJobOutbox, profiles } from '@paldora/database';
import type {
  CreateAvatarUploadInput,
  CreateAvatarUploadResult,
  MediaAssetId,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import { mediaDeletionOutboxEntry } from './media-job-outbox.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Injectable()
export class AvatarService {
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
          eq(mediaAssets.purpose, 'avatar'),
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
    if (asset.status !== 'pending') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'AVATAR_UPLOAD_ALREADY_HANDLED',
        'That profile photo upload was already handled.',
      );
    }
    let stored;
    try {
      stored = await this.storage.inspectObject(asset.objectKey);
    } catch {
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'STORAGE_UNAVAILABLE',
        'The uploaded profile photo could not be verified.',
      );
    }
    if (
      !stored ||
      stored.contentType !== asset.contentType ||
      stored.contentLength !== asset.contentLength
    ) {
      await this.infrastructure.databaseClient.transaction(
        async (transaction) => {
          const [failed] = await transaction
            .update(mediaAssets)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(
              and(
                eq(mediaAssets.id, asset.id),
                eq(mediaAssets.status, 'pending'),
              ),
            )
            .returning();
          if (failed) {
            await transaction
              .insert(mediaJobOutbox)
              .values(mediaDeletionOutboxEntry(failed));
          }
        },
      );
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_AVATAR_UPLOAD',
        'The uploaded profile photo did not match the signed request.',
      );
    }
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
        if (profile.avatarMediaId && profile.avatarMediaId !== asset.id) {
          const [oldAsset] = await transaction
            .select()
            .from(mediaAssets)
            .where(eq(mediaAssets.id, profile.avatarMediaId))
            .limit(1);
          if (oldAsset) {
            await transaction
              .insert(mediaJobOutbox)
              .values(mediaDeletionOutboxEntry(oldAsset));
          }
        }
      },
    );
    return this.users.getCurrentUser(userId);
  }

  public async deleteAvatar(
    userId: UserId,
  ): Promise<ReturnType<UserService['getCurrentUser']>> {
    await this.infrastructure.databaseClient.transaction(
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
        const [asset] = await transaction
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, profile.avatarMediaId))
          .limit(1);
        if (asset) {
          await transaction
            .insert(mediaJobOutbox)
            .values(mediaDeletionOutboxEntry(asset));
        }
      },
    );
    return this.users.getCurrentUser(userId);
  }
}
