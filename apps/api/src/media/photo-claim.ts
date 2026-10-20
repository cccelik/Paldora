import {
  mediaAssets,
  type DatabaseExecutor,
  type MediaAssetRow,
} from '@paldora/database';
import type { MediaPurpose } from '@paldora/domain';
import { inArray } from 'drizzle-orm';
import { mediaNotFound, mediaNotReady } from './media-errors.js';

export interface PhotoClaim {
  readonly ownerId: string;
  readonly purpose: MediaPurpose;
  /** The Box of a Box-scoped purpose; null for a user-scoped one. */
  readonly boxId: string | null;
  readonly ids: readonly string[];
  /**
   * Which of `ids` something already uses. Single use is final in the
   * database (a unique index per attachment table); this only makes the
   * common case a clean MEDIA_NOT_FOUND.
   */
  readonly findUsed: (
    executor: DatabaseExecutor,
    ids: readonly string[],
  ) => Promise<ReadonlySet<string>>;
}

const inFlight = (status: MediaAssetRow['status']) =>
  status === 'ready' || status === 'pending' || status === 'processing';

/**
 * Locks the photos being claimed (`FOR UPDATE`, so a retirement cannot slip
 * in) and checks each is the owner's, of this purpose and scope, and unused.
 * Every unusable photo looks the same: MEDIA_NOT_FOUND, whether it is not
 * yours, not here, deleted, or already used. One still being processed is
 * MEDIA_NOT_READY. Call it inside the claiming transaction.
 */
export async function assertPhotosUsable(
  executor: DatabaseExecutor,
  claim: PhotoClaim,
): Promise<readonly MediaAssetRow[]> {
  if (claim.ids.length === 0) return [];
  const assets = await executor
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, [...claim.ids]))
    .for('update');
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const used = await claim.findUsed(executor, claim.ids);
  const usable = claim.ids.map((id) => {
    const asset = byId.get(id);
    const valid =
      asset !== undefined &&
      asset.ownerUserId === claim.ownerId &&
      asset.purpose === claim.purpose &&
      asset.boxId === claim.boxId &&
      inFlight(asset.status) &&
      !used.has(id);
    return valid ? asset : undefined;
  });
  if (usable.some((asset) => asset === undefined)) throw mediaNotFound();
  if (usable.some((asset) => asset?.status !== 'ready')) throw mediaNotReady();
  return usable.filter((asset) => asset !== undefined);
}
