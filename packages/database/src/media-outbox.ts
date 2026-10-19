import type { MediaAssetRow, mediaJobOutbox } from './schema.js';

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
  jobType: 'media.process',
  payload: { mediaAssetId },
});

/**
 * Deletion intent with the keys snapshotted now, in the same transaction that
 * detaches the asset, so no later change can lose track of an object.
 */
export const mediaDeletionJob = (
  objectKeys: readonly string[],
): OutboxInsert => ({
  jobType: 'media.delete',
  payload: { objectKeys: [...new Set(objectKeys)] },
});
