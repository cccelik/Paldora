import {
  mediaAssets,
  rooms,
  type DatabaseExecutor,
  type DatabaseTransaction,
} from '@paldora/database';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { retireAssets } from '../media/media-retirement.js';
import { assertPhotosUsable } from '../media/photo-claim.js';

/** Banner assets another Room already shows (yours is fine). */
const usedByAnotherRoom =
  (ownerId: string) =>
  async (
    executor: DatabaseExecutor,
    ids: readonly string[],
  ): Promise<ReadonlySet<string>> => {
    const rows = await executor
      .select({ id: rooms.bannerMediaId })
      .from(rooms)
      .where(
        and(inArray(rooms.bannerMediaId, [...ids]), ne(rooms.userId, ownerId)),
      );
    return new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
  };

/**
 * Checks the new banner inside the Room save, with the asset locked so a
 * retirement (or the reaper) cannot slip in: the caller's own, a
 * `room_banner`, user-scoped, unused elsewhere, and `ready`. Anything else
 * is MEDIA_NOT_FOUND, one still processing is MEDIA_NOT_READY (the shared
 * claim rules). The composite foreign key and the unique index on
 * `rooms.banner_media_id` remain the final authority.
 */
export async function claimBanner(
  transaction: DatabaseTransaction,
  ownerId: string,
  mediaAssetId: string,
): Promise<void> {
  await assertPhotosUsable(transaction, {
    ownerId,
    purpose: 'room_banner',
    boxId: null,
    ids: [mediaAssetId],
    findUsed: usedByAnotherRoom(ownerId),
  });
}

/**
 * Retires the banner a save replaced or removed, in the same transaction:
 * tombstoned, with every stored object queued for deletion (keys
 * snapshotted now). There is no banner history.
 */
export async function retireBanner(
  transaction: DatabaseTransaction,
  mediaAssetId: string,
): Promise<void> {
  const previous = await transaction
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .for('update');
  await retireAssets(
    transaction,
    previous.filter((asset) => asset.status !== 'deleted'),
  );
}
