import { MEDIA_DELETE_JOB, MEDIA_PROCESS_JOB } from '@paldora/domain';
import { inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from './index.js';
import { mediaAssets, mediaJobOutbox, type MediaAssetRow } from './schema.js';

type OutboxInsert = typeof mediaJobOutbox.$inferInsert;
type StoredKeys = Pick<
  MediaAssetRow,
  | 'uploadObjectKey'
  | 'masterObjectKey'
  | 'displayObjectKey'
  | 'thumbnailObjectKey'
>;

/** Every object an asset may own in storage, raw upload included. */
export function storedObjectKeys(asset: StoredKeys): string[] {
  return [
    asset.uploadObjectKey,
    asset.masterObjectKey,
    asset.displayObjectKey,
    asset.thumbnailObjectKey,
  ].filter((key): key is string => typeof key === 'string');
}

export const mediaProcessJob = (mediaAssetId: string): OutboxInsert => ({
  jobType: MEDIA_PROCESS_JOB,
  payload: { mediaAssetId },
});

/**
 * Deletion intent with the keys snapshotted now, in the same transaction that
 * detaches the asset, so no later change can lose track of an object.
 */
export const mediaDeletionJob = (
  objectKeys: readonly string[],
): OutboxInsert => ({
  jobType: MEDIA_DELETE_JOB,
  payload: { objectKeys: [...new Set(objectKeys)] },
});

/**
 * Tombstones assets and queues deletion of every object they own, in the
 * caller's transaction. Keys are snapshotted now, so a later cascade or
 * update cannot lose track of an object (R4). The caller locks the rows
 * (`FOR UPDATE`) first. Shared by the API and the worker's reaper.
 */
export async function retireMediaAssets(
  executor: DatabaseExecutor,
  assets: readonly MediaAssetRow[],
  now: Date = new Date(),
): Promise<void> {
  if (assets.length === 0) return;
  await executor
    .update(mediaAssets)
    .set({ status: 'deleted', updatedAt: now })
    .where(
      inArray(
        mediaAssets.id,
        assets.map((asset) => asset.id),
      ),
    );
  await executor
    .insert(mediaJobOutbox)
    .values(assets.map((asset) => mediaDeletionJob(storedObjectKeys(asset))));
}
