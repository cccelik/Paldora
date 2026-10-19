import type { mediaAssets, mediaJobOutbox } from '@paldora/database';
import type { MediaAssetId } from '@paldora/domain';

type DeletableMediaAsset = Pick<
  typeof mediaAssets.$inferSelect,
  'id' | 'objectKey' | 'displayObjectKey' | 'thumbnailObjectKey'
>;

export function mediaDeletionOutboxEntry(
  asset: DeletableMediaAsset,
): typeof mediaJobOutbox.$inferInsert {
  return {
    jobType: 'delete-media-object',
    mediaAssetId: asset.id,
    payload: {
      mediaAssetId: asset.id,
      objectKeys: [
        asset.objectKey,
        asset.displayObjectKey,
        asset.thumbnailObjectKey,
      ].filter((key): key is string => Boolean(key)),
    },
  };
}

export function mediaProcessingOutboxEntry(
  mediaAssetId: MediaAssetId,
): typeof mediaJobOutbox.$inferInsert {
  return {
    jobType: 'process-post-image',
    mediaAssetId,
    payload: { mediaAssetId },
  };
}
