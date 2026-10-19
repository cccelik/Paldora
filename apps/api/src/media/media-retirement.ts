import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  storedObjectKeys,
  type DatabaseExecutor,
  type MediaAssetRow,
} from '@paldora/database';
import { inArray } from 'drizzle-orm';

/**
 * Tombstones assets and queues deletion of every object they own, in the
 * caller's transaction. Keys are snapshotted now, so a later cascade or
 * update cannot lose track of an object (R4). Keys the worker has not yet
 * recorded (derivatives of an upload still being processed) are removed by
 * the worker itself when it finds the asset retired.
 */
export async function retireAssets(
  executor: DatabaseExecutor,
  assets: readonly MediaAssetRow[],
): Promise<void> {
  if (assets.length === 0) return;
  await executor
    .update(mediaAssets)
    .set({ status: 'deleted', updatedAt: new Date() })
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
