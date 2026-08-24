import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { mediaAssets, mediaJobOutbox, postReactions } from '@paldora/database';
import type {
  CreateReactionPhotoUploadInput,
  CreateReactionPhotoUploadResult,
  MediaAsset,
  MediaAssetId,
  PostId,
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
import { InteractionAuthorizationPolicy } from './interaction-authorization-policy.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Injectable()
export class ReactionMediaService {
  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(InteractionAuthorizationPolicy)
    private readonly policy: InteractionAuthorizationPolicy,
    @Inject(UserService) private readonly users: UserService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async createUpload(
    userId: UserId,
    postId: PostId,
    input: CreateReactionPhotoUploadInput,
  ): Promise<CreateReactionPhotoUploadResult> {
    const post = await this.policy.requirePostInteraction(userId, postId);
    const extension =
      input.contentType === 'image/jpeg'
        ? 'jpg'
        : input.contentType.split('/')[1];
    const objectKey = `reactions/${post.boxId}/${userId}/${randomUUID()}.${extension}`;
    const [asset] = await this.infrastructure.databaseClient
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        boxId: post.boxId,
        purpose: 'reaction_image',
        objectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
      })
      .returning();
    if (!asset) throw new Error('Reaction media insert returned no row.');
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
        'The camera reaction upload could not be prepared.',
      );
    }
  }

  public async completeUpload(
    userId: UserId,
    mediaAssetId: MediaAssetId,
  ): Promise<MediaAsset> {
    const [asset] = await this.infrastructure.databaseClient
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.purpose, 'reaction_image'),
          eq(mediaAssets.status, 'pending'),
        ),
      )
      .limit(1);
    if (!asset) this.notFound();
    let stored;
    try {
      stored = await this.storage.inspectObject(asset.objectKey);
    } catch {
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'STORAGE_UNAVAILABLE',
        'The camera reaction could not be verified.',
      );
    }
    if (
      !stored ||
      stored.contentType !== asset.contentType ||
      stored.contentLength !== asset.contentLength
    ) {
      await this.fail(mediaAssetId);
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_REACTION_MEDIA_UPLOAD',
        'The captured photo did not match the signed request.',
      );
    }
    const processing = await this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const [claimed] = await transaction
          .update(mediaAssets)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.id, mediaAssetId),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.status, 'pending'),
            ),
          )
          .returning();
        if (!claimed) return undefined;
        await transaction
          .insert(mediaJobOutbox)
          .values(mediaProcessingOutboxEntry(mediaAssetId));
        return claimed;
      },
    );
    if (!processing) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'REACTION_MEDIA_UPLOAD_ALREADY_HANDLED',
        'That camera reaction upload was already handled.',
      );
    }
    return this.users.mapMediaAsset(processing);
  }

  public async cancelUpload(
    userId: UserId,
    mediaAssetId: MediaAssetId,
  ): Promise<{ success: true }> {
    const asset = await this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const [owned] = await transaction
          .select()
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, mediaAssetId),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.purpose, 'reaction_image'),
            ),
          )
          .for('update')
          .limit(1);
        if (!owned) return undefined;
        const [attached] = await transaction
          .select({ id: postReactions.mediaAssetId })
          .from(postReactions)
          .where(eq(postReactions.mediaAssetId, mediaAssetId))
          .limit(1);
        if (attached) return undefined;
        const [failed] = await transaction
          .update(mediaAssets)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(mediaAssets.id, mediaAssetId))
          .returning();
        if (failed) {
          await transaction
            .insert(mediaJobOutbox)
            .values(mediaDeletionOutboxEntry(failed));
        }
        return failed;
      },
    );
    if (!asset) this.notFound();
    return { success: true };
  }

  private async fail(mediaAssetId: MediaAssetId): Promise<void> {
    await this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const [failed] = await transaction
          .update(mediaAssets)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(mediaAssets.id, mediaAssetId))
          .returning();
        if (failed) {
          await transaction
            .insert(mediaJobOutbox)
            .values(mediaDeletionOutboxEntry(failed));
        }
      },
    );
  }

  private notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'REACTION_MEDIA_UPLOAD_NOT_FOUND',
      'That camera reaction upload is unavailable.',
    );
  }
}
