import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  postMedia,
  postReactions,
  storedObjectKeys,
  type PaldoraDatabase,
} from '@paldora/database';
import { UNATTACHED_MEDIA_TTL_SECONDS } from '@paldora/domain';
import {
  and,
  eq,
  inArray,
  lt,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

type Executor = Pick<PaldoraDatabase, 'select'>;

/**
 * Box-scoped uploads that only become someone's when an API transaction
 * claims them: a post photo by `post_media`, a camera capture by
 * `post_reactions`. Anything else is unattached. Add a branch here with each
 * new claimed purpose (and widen `media_assets_unattached_index`).
 */
export function unattachedMedia(executor: Executor): SQL {
  const inPost = executor
    .select({ one: sql`1` })
    .from(postMedia)
    .where(eq(postMedia.mediaAssetId, mediaAssets.id));
  const inReaction = executor
    .select({ one: sql`1` })
    .from(postReactions)
    .where(eq(postReactions.mediaAssetId, mediaAssets.id));
  const predicate = or(
    and(eq(mediaAssets.purpose, 'post_image'), notExists(inPost)),
    and(eq(mediaAssets.purpose, 'reaction_image'), notExists(inReaction)),
  );
  if (!predicate) throw new Error('Unattached-media predicate is empty.');
  return predicate;
}

/**
 * Ready post photos and camera captures nothing claimed within a day (the
 * composer or camera was closed, or the post or reaction failed). They are
 * tombstoned and every object they own is queued for deletion. Rows locked
 * by a claim in progress are skipped and looked at again next run.
 */
export async function expireUnattachedMedia(
  database: PaldoraDatabase,
  now: Date,
  batchSize: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - UNATTACHED_MEDIA_TTL_SECONDS * 1_000);
  return database.transaction(async (transaction) => {
    const orphaned = await transaction
      .select()
      .from(mediaAssets)
      .where(
        and(
          // Matches `media_assets_unattached_index` exactly.
          inArray(mediaAssets.purpose, ['post_image', 'reaction_image']),
          eq(mediaAssets.status, 'ready'),
          lt(mediaAssets.updatedAt, cutoff),
          unattachedMedia(transaction),
        ),
      )
      // Oldest first, so a backlog drains in order.
      .orderBy(mediaAssets.updatedAt)
      .limit(batchSize)
      .for('update', { skipLocked: true });
    if (orphaned.length === 0) return 0;
    await transaction
      .update(mediaAssets)
      .set({ status: 'deleted', updatedAt: now })
      .where(
        inArray(
          mediaAssets.id,
          orphaned.map((asset) => asset.id),
        ),
      );
    await transaction
      .insert(mediaJobOutbox)
      .values(
        orphaned.map((asset) => mediaDeletionJob(storedObjectKeys(asset))),
      );
    return orphaned.length;
  });
}
