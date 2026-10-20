import {
  retireMediaAssets,
  type DatabaseExecutor,
  type MediaAssetRow,
} from '@paldora/database';

/**
 * Tombstones assets and queues deletion of every object they own, in the
 * caller's transaction. Keys are snapshotted now, so a later cascade or
 * update cannot lose track of an object (R4). Keys the worker has not yet
 * recorded (derivatives of an upload still being processed) are removed by
 * the worker itself when it finds the asset retired. The one definition
 * lives in `@paldora/database`, shared with the worker's reaper.
 */
export function retireAssets(
  executor: DatabaseExecutor,
  assets: readonly MediaAssetRow[],
): Promise<void> {
  return retireMediaAssets(executor, assets);
}
