import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  profiles,
  storedObjectKeys,
  type MediaAssetRow,
} from '@paldora/database';
import type { MediaPurpose } from '@paldora/domain';
import { eq } from 'drizzle-orm';
import type { Executor } from '../outbox/outbox-store.js';

/** Runs inside the transaction that marks an asset ready. */
export type AttachReadyAsset = (
  transaction: Executor,
  asset: MediaAssetRow,
) => Promise<void>;

export async function retireAsset(
  transaction: Executor,
  asset: MediaAssetRow,
): Promise<void> {
  await transaction
    .update(mediaAssets)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(mediaAssets.id, asset.id));
  await transaction
    .insert(mediaJobOutbox)
    .values(mediaDeletionJob(storedObjectKeys(asset)));
}

/**
 * The newest ready avatar wins. The previous one is retired only now, after
 * its replacement is ready, so a failed upload never costs the old photo.
 * An older upload that finishes late is retired instead of shown.
 */
const attachAvatar: AttachReadyAsset = async (transaction, asset) => {
  const [profile] = await transaction
    .select({ avatarMediaId: profiles.avatarMediaId })
    .from(profiles)
    .where(eq(profiles.userId, asset.ownerUserId))
    .for('update')
    .limit(1);
  if (!profile) return retireAsset(transaction, asset);
  const [current] = profile.avatarMediaId
    ? await transaction
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, profile.avatarMediaId))
        .limit(1)
    : [];
  if (current && current.createdAt >= asset.createdAt) {
    return retireAsset(transaction, asset);
  }
  await transaction
    .update(profiles)
    .set({ avatarMediaId: asset.id, updatedAt: new Date() })
    .where(eq(profiles.userId, asset.ownerUserId));
  if (current) await retireAsset(transaction, current);
};

/**
 * Post photos attach when the post is created (the API claims them in its own
 * transaction), so becoming ready has nothing to do. A ready photo that no
 * post claims is removed by the reaper.
 */
const attachPostImage: AttachReadyAsset = async () => undefined;

/** What "ready" means for each purpose. Add a row with each new purpose. */
export const attachments: Readonly<Record<MediaPurpose, AttachReadyAsset>> = {
  avatar: attachAvatar,
  post_image: attachPostImage,
};
