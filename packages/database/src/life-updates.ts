import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from './index.js';
import { retireMediaAssets } from './media-outbox.js';
import {
  boxMemberships,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  posts,
} from './schema.js';

/**
 * A feed `WHERE` fragment over `posts` that keeps one row per Life Update:
 * true for an ordinary post, and for the backing post of the viewer's
 * reachable delivery with the greatest post ID (an active backing post in a
 * Box the viewer belongs to right now). Every delivery of one Life Update
 * shares its `created_at`, so dropping the others keeps the keyset
 * `(created_at desc, id desc)` stable and duplicate-free across pages. It
 * ignores blocks on purpose: a hidden Life Update dedupes to one placeholder
 * the same way.
 */
export function representativeDelivery(viewerId: string): SQL {
  return sql`(${posts.kind} = 'post' or not exists (
    select 1
    from ${lifeUpdateDeliveries} d1
    join ${lifeUpdateDeliveries} d2
      on d2.life_update_id = d1.life_update_id and d2.post_id > d1.post_id
    join ${posts} p2 on p2.id = d2.post_id and p2.status = 'active'
    join ${boxMemberships} m2
      on m2.box_id = d2.box_id and m2.user_id = ${viewerId} and m2.status = 'active'
    where d1.post_id = ${posts.id}
  ))`;
}

/**
 * Tombstones Life Updates in the caller's transaction: their photos are
 * locked, unlinked, and retired (object keys snapshotted into the deletion
 * outbox), then the rows become `deleted` with their sections erased. Their
 * backing posts are the caller's business. Already-deleted rows are left
 * alone, so a repeat is harmless. Shared by Box deletion (API) and the
 * deliveryless sweep (worker).
 */
export async function tombstoneLifeUpdates(
  executor: DatabaseExecutor,
  lifeUpdateIds: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  if (lifeUpdateIds.length === 0) return;
  const ids = [...lifeUpdateIds];
  const linked = executor
    .select({ id: lifeUpdateMedia.mediaAssetId })
    .from(lifeUpdateMedia)
    .where(inArray(lifeUpdateMedia.lifeUpdateId, ids));
  const photos = await executor
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, linked))
    .orderBy(mediaAssets.id)
    .for('update');
  await executor
    .delete(lifeUpdateMedia)
    .where(inArray(lifeUpdateMedia.lifeUpdateId, ids));
  await retireMediaAssets(
    executor,
    photos.filter((photo) => photo.status !== 'deleted'),
    now,
  );
  await executor
    .update(lifeUpdates)
    .set({ status: 'deleted', sections: {}, deletedAt: now, updatedAt: now })
    .where(and(inArray(lifeUpdates.id, ids), eq(lifeUpdates.status, 'active')));
}
