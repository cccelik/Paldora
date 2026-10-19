import { Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  mediaProcessJob,
  type MediaAssetRow,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  SIGNED_UPLOAD_TTL_SECONDS,
  UPLOAD_COMPLETION_GRACE_SECONDS,
  type MediaAssetId,
  type UserId,
} from '@paldora/domain';
import type { ObjectStorage, StoredObject } from '@paldora/storage';
import type {
  CreateMediaUploadInput,
  MediaAssetView,
  MediaUpload,
} from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE, OBJECT_STORAGE } from '../platform/tokens.js';
import {
  mediaNotFound,
  storageUnavailable,
  uploadAlreadyHandled,
  uploadExpired,
  uploadMismatch,
} from './media-errors.js';
import { toMediaAssetView } from './media-mappers.js';

const matchesReservation = (
  stored: StoredObject | null,
  asset: MediaAssetRow,
): boolean =>
  stored !== null &&
  stored.contentType === asset.contentType &&
  stored.contentLength === asset.contentLength;

/**
 * The generic upload flow for every media purpose (R4): reserve, sign, verify,
 * queue. Purpose rules come from `MEDIA_PURPOSE_POLICIES`, already enforced
 * by the request schema; ownership is enforced here on every step.
 */
@Injectable()
export class MediaUploadService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public async create(
    userId: UserId,
    input: CreateMediaUploadInput,
  ): Promise<MediaUpload> {
    // Random, non-identifying keys: signed URLs necessarily contain them.
    const uploadObjectKey = `uploads/${randomUUID()}`;
    let upload;
    try {
      upload = await this.storage.createSignedUpload({
        objectKey: uploadObjectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
        expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
      });
    } catch {
      throw storageUnavailable();
    }
    const [asset] = await this.database
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        purpose: input.purpose,
        contentType: input.contentType,
        contentLength: input.contentLength,
        uploadObjectKey,
        uploadExpiresAt: upload.expiresAt,
      })
      .returning();
    if (!asset) throw new Error('Media asset insert returned no row.');
    return {
      mediaAsset: toMediaAssetView(asset),
      upload: {
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    };
  }

  public async get(
    userId: UserId,
    mediaAssetId: MediaAssetId,
  ): Promise<MediaAssetView> {
    return toMediaAssetView(await this.ownedAsset(userId, mediaAssetId));
  }

  public async complete(
    userId: UserId,
    mediaAssetId: MediaAssetId,
    now = new Date(),
  ): Promise<MediaAssetView> {
    const asset = await this.ownedAsset(userId, mediaAssetId);
    if (asset.status !== 'pending') throw uploadAlreadyHandled();
    const graceMs = UPLOAD_COMPLETION_GRACE_SECONDS * 1_000;
    if (now.getTime() > asset.uploadExpiresAt.getTime() + graceMs) {
      throw uploadExpired();
    }
    let stored: StoredObject | null;
    try {
      // Network I/O happens before any transaction opens.
      stored = await this.storage.inspect(asset.uploadObjectKey);
    } catch {
      throw storageUnavailable();
    }
    if (!matchesReservation(stored, asset)) {
      await this.rejectUpload(asset);
      throw uploadMismatch();
    }
    return this.queueProcessing(asset);
  }

  private async ownedAsset(
    userId: UserId,
    mediaAssetId: MediaAssetId,
  ): Promise<MediaAssetRow> {
    const [asset] = await this.database
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.ownerUserId, userId),
        ),
      )
      .limit(1);
    if (!asset || asset.status === 'deleted') throw mediaNotFound();
    return asset;
  }

  /** Marks the reservation failed and schedules removal of whatever arrived. */
  private async rejectUpload(asset: MediaAssetRow): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [failed] = await transaction
        .update(mediaAssets)
        .set({
          status: 'failed',
          failureReason: 'upload_mismatch',
          updatedAt: new Date(),
        })
        .where(
          and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'pending')),
        )
        .returning({ id: mediaAssets.id });
      if (failed) {
        await transaction
          .insert(mediaJobOutbox)
          .values(mediaDeletionJob([asset.uploadObjectKey]));
      }
    });
  }

  /** Single use: only one completion can move `pending` to `processing`. */
  private async queueProcessing(asset: MediaAssetRow): Promise<MediaAssetView> {
    return this.database.transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(mediaAssets)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(
          and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'pending')),
        )
        .returning();
      if (!claimed) throw uploadAlreadyHandled();
      await transaction
        .insert(mediaJobOutbox)
        .values(mediaProcessJob(claimed.id));
      return toMediaAssetView(claimed);
    });
  }
}
