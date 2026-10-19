import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  type MediaAssetRow,
  type PaldoraDatabase,
} from '@paldora/database';
import { MEDIA_PURPOSE_POLICIES, type MediaPurpose } from '@paldora/domain';
import { ObjectTooLargeError, type ObjectStorage } from '@paldora/storage';
import { and, eq } from 'drizzle-orm';
import type { JobHandler } from '../job-router.js';
import type { OutboxJobData } from '../outbox/dispatcher.js';
import {
  isFinished,
  loadOutboxRow,
  markCompleted,
  type Executor,
} from '../outbox/outbox-store.js';
import { attachments, retireAsset } from './attachments.js';
import {
  createDerivatives,
  UndecodableImageError,
  type Derivatives,
} from './derivatives.js';

export interface MediaJobDependencies {
  readonly database: PaldoraDatabase;
  readonly storage: ObjectStorage;
}

/** Deterministic keys, so a retried job overwrites instead of orphaning. */
export const derivativeKeys = (mediaAssetId: string) => ({
  masterObjectKey: `media/${mediaAssetId}/master.webp`,
  displayObjectKey: `media/${mediaAssetId}/display.webp`,
  thumbnailObjectKey: `media/${mediaAssetId}/thumbnail.webp`,
});

/** Fails the asset and discards the raw upload; the job itself succeeded. */
export async function failAsset(
  executor: Executor,
  asset: Pick<MediaAssetRow, 'id' | 'uploadObjectKey'>,
  reason: 'undecodable' | 'processing_exhausted',
): Promise<void> {
  const [failed] = await executor
    .update(mediaAssets)
    .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
    .where(
      and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'processing')),
    )
    .returning({ id: mediaAssets.id });
  if (failed) {
    await executor
      .insert(mediaJobOutbox)
      .values(mediaDeletionJob([asset.uploadObjectKey]));
  }
}

async function loadProcessingAsset(
  database: PaldoraDatabase,
  mediaAssetId: string | undefined,
): Promise<MediaAssetRow | undefined> {
  if (!mediaAssetId) return undefined;
  const [asset] = await database
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  return asset?.status === 'processing' ? asset : undefined;
}

async function publishReady(
  dependencies: MediaJobDependencies,
  asset: MediaAssetRow,
  derivatives: Derivatives,
  outboxId: string,
): Promise<void> {
  const keys = derivativeKeys(asset.id);
  await dependencies.database.transaction(async (transaction) => {
    const [ready] = await transaction
      .update(mediaAssets)
      .set({
        status: 'ready',
        ...keys,
        width: derivatives.master.width,
        height: derivatives.master.height,
        updatedAt: new Date(),
      })
      .where(
        and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'processing')),
      )
      .returning();
    if (ready) {
      // D2: the raw upload, with its original metadata, is not kept.
      await transaction
        .insert(mediaJobOutbox)
        .values(mediaDeletionJob([ready.uploadObjectKey]));
      await attachments[ready.purpose as MediaPurpose](transaction, ready);
    } else {
      // Removed while processing: discard everything this job wrote.
      await retireAsset(transaction, { ...asset, ...keys });
    }
    await markCompleted(transaction, outboxId);
  });
}

/**
 * `media.process`: decode with strict limits, write metadata-free
 * derivatives, then mark ready and attach in one transaction. Storage errors
 * are retried by BullMQ; undecodable input fails the asset without retries.
 */
export function createProcessMediaHandler(
  dependencies: MediaJobDependencies,
): JobHandler {
  return async (job, { logger }) => {
    const { outboxId } = job.data as OutboxJobData;
    const row = await loadOutboxRow(dependencies.database, outboxId);
    if (!row || isFinished(row)) return;
    const asset = await loadProcessingAsset(
      dependencies.database,
      row.payload.mediaAssetId,
    );
    if (!asset) {
      await markCompleted(dependencies.database, outboxId);
      return;
    }
    const policy = MEDIA_PURPOSE_POLICIES[asset.purpose as MediaPurpose];
    let derivatives: Derivatives;
    try {
      const input = await dependencies.storage.read(
        asset.uploadObjectKey,
        policy.maxBytes,
      );
      derivatives = await createDerivatives(input, policy);
    } catch (error) {
      if (
        !(error instanceof UndecodableImageError) &&
        !(error instanceof ObjectTooLargeError)
      ) {
        throw error;
      }
      logger.warn({ mediaAssetId: asset.id }, 'upload rejected as undecodable');
      await dependencies.database.transaction(async (transaction) => {
        await failAsset(transaction, asset, 'undecodable');
        await markCompleted(transaction, outboxId);
      });
      return;
    }
    const keys = derivativeKeys(asset.id);
    await Promise.all([
      dependencies.storage.write(
        keys.masterObjectKey,
        'image/webp',
        derivatives.master.bytes,
      ),
      dependencies.storage.write(
        keys.displayObjectKey,
        'image/webp',
        derivatives.display.bytes,
      ),
      dependencies.storage.write(
        keys.thumbnailObjectKey,
        'image/webp',
        derivatives.thumbnail.bytes,
      ),
    ]);
    await publishReady(dependencies, asset, derivatives, outboxId);
    logger.info({ mediaAssetId: asset.id }, 'media processed');
  };
}
