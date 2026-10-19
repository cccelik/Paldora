import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { mediaAssets, mediaJobOutbox, rooms } from '@paldora/database';
import type {
  CreateRoomBannerUploadInput,
  CreateRoomBannerUploadResult,
  MediaAssetId,
  RoomView,
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
import { RoomService } from './room.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Injectable()
export class RoomBannerService {
  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(UserService) private readonly users: UserService,
    @Inject(RoomService) private readonly roomsService: RoomService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async createUpload(
    userId: UserId,
    input: CreateRoomBannerUploadInput,
  ): Promise<CreateRoomBannerUploadResult> {
    await this.roomsService.ensure(userId);
    const extension =
      input.contentType === 'image/jpeg'
        ? 'jpg'
        : input.contentType.split('/')[1];
    const objectKey = `room-banners/${userId}/${randomUUID()}.${extension}`;
    const [asset] = await this.infrastructure.databaseClient
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        purpose: 'room_banner',
        objectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
      })
      .returning();
    if (!asset) throw new Error('Room banner insert returned no row.');
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
        'The Room banner upload could not be prepared.',
      );
    }
  }

  public async completeUpload(
    userId: UserId,
    id: MediaAssetId,
  ): Promise<RoomView> {
    const [asset] = await this.infrastructure.databaseClient
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.ownerUserId, userId),
          eq(mediaAssets.purpose, 'room_banner'),
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
          'The uploaded Room banner could not be verified.',
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
        'INVALID_ROOM_BANNER_UPLOAD',
        'The uploaded banner did not match the signed request.',
      );
    }
    const claimed = await this.infrastructure.databaseClient.transaction(
      async (tx) => {
        const [room] = await tx
          .select({ bannerMediaId: rooms.bannerMediaId })
          .from(rooms)
          .where(eq(rooms.userId, userId))
          .for('update')
          .limit(1);
        if (!room) this.notFound();
        const [ready] = await tx
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
        if (!ready) return false;
        await tx
          .update(rooms)
          .set({ bannerMediaId: id, updatedAt: new Date() })
          .where(eq(rooms.userId, userId));
        await tx.insert(mediaJobOutbox).values(mediaProcessingOutboxEntry(id));
        if (room.bannerMediaId && room.bannerMediaId !== id) {
          const [old] = await tx
            .select()
            .from(mediaAssets)
            .where(eq(mediaAssets.id, room.bannerMediaId))
            .limit(1);
          if (old)
            await tx
              .insert(mediaJobOutbox)
              .values(mediaDeletionOutboxEntry(old));
        }
        return true;
      },
    );
    if (!claimed)
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ROOM_BANNER_UPLOAD_ALREADY_HANDLED',
        'That banner upload was already handled.',
      );
    return this.roomsService.mine(userId);
  }

  public async cancelUpload(
    userId: UserId,
    id: MediaAssetId,
  ): Promise<{ success: true }> {
    const removed = await this.infrastructure.databaseClient.transaction(
      async (tx) => {
        const [attached] = await tx
          .select({ id: rooms.userId })
          .from(rooms)
          .where(eq(rooms.bannerMediaId, id))
          .limit(1);
        if (attached) return undefined;
        const [asset] = await tx
          .update(mediaAssets)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.id, id),
              eq(mediaAssets.ownerUserId, userId),
              eq(mediaAssets.purpose, 'room_banner'),
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

  public async delete(userId: UserId): Promise<RoomView> {
    await this.infrastructure.databaseClient.transaction(async (tx) => {
      const [room] = await tx
        .select({ bannerMediaId: rooms.bannerMediaId })
        .from(rooms)
        .where(eq(rooms.userId, userId))
        .for('update')
        .limit(1);
      if (!room?.bannerMediaId) return;
      await tx
        .update(rooms)
        .set({ bannerMediaId: null, updatedAt: new Date() })
        .where(eq(rooms.userId, userId));
      const [asset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, room.bannerMediaId))
        .limit(1);
      if (asset)
        await tx.insert(mediaJobOutbox).values(mediaDeletionOutboxEntry(asset));
    });
    return this.roomsService.mine(userId);
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
      'ROOM_BANNER_UPLOAD_NOT_FOUND',
      'That Room banner upload is unavailable.',
    );
  }
}
