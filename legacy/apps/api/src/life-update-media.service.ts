import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  lifeUpdateMedia,
  mediaAssets,
  mediaJobOutbox,
} from '@paldora/database';
import type {
  CreateLifeUpdateMediaUploadInput,
  CreateLifeUpdateMediaUploadResult,
  MediaAsset,
  MediaAssetId,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import {
  mediaDeletionOutboxEntry,
  mediaProcessingOutboxEntry,
} from './media-job-outbox.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Injectable()
export class LifeUpdateMediaService {
  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(UserService) private readonly users: UserService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async createUpload(
    userId: UserId,
    input: CreateLifeUpdateMediaUploadInput,
  ): Promise<CreateLifeUpdateMediaUploadResult> {
    const extension =
      input.contentType === 'image/jpeg'
        ? 'jpg'
        : input.contentType.split('/')[1];
    const objectKey = `life-updates/${userId}/${randomUUID()}.${extension}`;
    const [asset] = await this.infrastructure.databaseClient
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        purpose: 'life_update_image',
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
        upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
      };
    } catch {
      await this.fail(asset.id as MediaAssetId);
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'STORAGE_UNAVAILABLE',
        'The Life Update photo upload could not be prepared.',
      );
    }
  }

  public async completeUpload(
    userId: UserId,
    id: MediaAssetId,
  ): Promise<MediaAsset> {
    const [asset] = await this.infrastructure.databaseClient
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.purpose, 'life_update_image'),
          eq(mediaAssets.status, 'pending'),
        ),
      )
      .limit(1);
    if (!asset) this.notFound();
    const stored = await this.storage
      .inspectObject(asset.objectKey)
      .catch(() => {
        throw new ApiError(
          HttpStatus.BAD_GATEWAY,
          'STORAGE_UNAVAILABLE',
          'The uploaded Life Update photo could not be verified.',
        );
      });
    if (
      !stored ||
      stored.contentType !== asset.contentType ||
      stored.contentLength !== asset.contentLength
    ) {
      await this.fail(id);
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_LIFE_UPDATE_MEDIA_UPLOAD',
        'The uploaded photo did not match the signed request.',
      );
    }
    const claimed = await this.infrastructure.databaseClient.transaction(
      async (tx) => {
        const [row] = await tx
          .update(mediaAssets)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.id, id),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.status, 'pending'),
            ),
          )
          .returning();
        if (!row) return undefined;
        await tx.insert(mediaJobOutbox).values(mediaProcessingOutboxEntry(id));
        return row;
      },
    );
    if (!claimed)
      throw new ApiError(
        HttpStatus.CONFLICT,
        'LIFE_UPDATE_MEDIA_UPLOAD_ALREADY_HANDLED',
        'That upload was already handled.',
      );
    return this.users.mapMediaAsset(claimed);
  }

  public async cancelUpload(
    userId: UserId,
    id: MediaAssetId,
  ): Promise<{ success: true }> {
    const [attached] = await this.infrastructure.databaseClient
      .select({ id: lifeUpdateMedia.mediaAssetId })
      .from(lifeUpdateMedia)
      .where(eq(lifeUpdateMedia.mediaAssetId, id))
      .limit(1);
    if (attached) this.notFound();
    const removed = await this.infrastructure.databaseClient.transaction(
      async (tx) => {
        const [asset] = await tx
          .update(mediaAssets)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.id, id),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.purpose, 'life_update_image'),
            ),
          )
          .returning();
        if (asset)
          await tx
            .insert(mediaJobOutbox)
            .values(mediaDeletionOutboxEntry(asset));
        return asset;
      },
    );
    if (!removed) this.notFound();
    return { success: true };
  }

  private async fail(id: MediaAssetId): Promise<void> {
    await this.infrastructure.databaseClient.transaction(async (tx) => {
      const [asset] = await tx
        .update(mediaAssets)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(mediaAssets.id, id))
        .returning();
      if (asset)
        await tx.insert(mediaJobOutbox).values(mediaDeletionOutboxEntry(asset));
    });
  }

  private notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'LIFE_UPDATE_MEDIA_UPLOAD_NOT_FOUND',
      'That Life Update photo upload is unavailable.',
    );
  }
}
