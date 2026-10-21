import {
  mediaAssets,
  postReactions,
  type DatabaseExecutor,
  type MediaAssetRow,
  retireMediaAssets,
} from '@paldora/database';
import { eq, sql } from 'drizzle-orm';
import { mediaNotFound, mediaNotReady } from '../../media/media-errors.js';

const claimable = new Set(['pending', 'processing', 'ready']);

/**
 * Claims a camera capture for a reaction, inside the setter's transaction.
 * The asset row is locked `FOR UPDATE`, so the reaper (which skips locked
 * rows) cannot retire it mid-claim. It must be the viewer's own
 * `reaction_image`, from the post's Box, and used by no reaction yet. Every
 * unusable asset answers MEDIA_NOT_FOUND; one still processing answers
 * MEDIA_NOT_READY. The unique index on `post_reactions.media_asset_id`
 * stays the final word on single use (a racing claim maps to
 * MEDIA_NOT_FOUND in the caller).
 */
export async function claimReactionImage(
  transaction: DatabaseExecutor,
  userId: string,
  boxId: string,
  mediaAssetId: string,
): Promise<MediaAssetRow> {
  const [row] = await transaction
    .select({
      asset: mediaAssets,
      used: sql<boolean>`exists (
        select 1 from ${postReactions}
        where ${postReactions.mediaAssetId} = ${mediaAssets.id}
      )`.mapWith(Boolean),
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .for('update')
    .limit(1);
  const asset = row?.asset;
  const usable =
    asset !== undefined &&
    !row?.used &&
    asset.ownerUserId === userId &&
    asset.purpose === 'reaction_image' &&
    asset.boxId === boxId &&
    claimable.has(asset.status);
  if (!usable) throw mediaNotFound();
  if (asset.status !== 'ready') throw mediaNotReady();
  return asset;
}

/**
 * Retires the camera image a replaced or removed reaction used: tombstoned,
 * with deletion of every object it owns queued in the same transaction.
 */
export async function retireReactionImage(
  transaction: DatabaseExecutor,
  mediaAssetId: string | null,
): Promise<void> {
  if (mediaAssetId === null) return;
  const assets = await transaction
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .for('update');
  await retireMediaAssets(
    transaction,
    assets.filter((asset) => asset.status !== 'deleted'),
  );
}

/**
 * Serializes one person's reaction writes on one target for the rest of the
 * transaction. Reading the current reaction and replacing it (and retiring
 * the camera image it used) then cannot interleave with a concurrent set by
 * the same person; the primary key still decides any insert race.
 */
export async function lockReactor(
  transaction: DatabaseExecutor,
  target: 'post' | 'comment',
  targetId: string,
  userId: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`reaction:${target}:${targetId}:${userId}`}, 0))`,
  );
}
