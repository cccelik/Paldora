import {
  lifeUpdateDeliveries,
  lifeUpdates,
  posts,
  tombstoneLifeUpdates,
  type PaldoraDatabase,
} from '@paldora/database';
import { and, count, eq, lt, notExists, sql } from 'drizzle-orm';

/**
 * Old enough that the transaction which created it (and any Box deletion
 * racing it) has long committed. A Life Update cannot be committed without
 * a delivery (deferred trigger), so one without any is a Box-cascade
 * leftover.
 */
export const DELIVERYLESS_GRACE_MS = 60 * 60 * 1_000;

export interface DeliverylessResult {
  /** Box-audience Life Updates tombstoned because every Box was deleted. */
  readonly tombstonedLifeUpdates: number;
  /**
   * Backing posts with no delivery. The deferred trigger makes this
   * impossible, so anything above zero is a canary that needs a human.
   */
  readonly orphanedBackingPosts: number;
}

/**
 * The safety net for plan decision 8. Box deletion tombstones a Life Update
 * that loses its last Box in its own transaction; if two of its Boxes were
 * deleted in a way that slipped past that, it is left active with no
 * delivery. This tombstones such rows and retires their photos (object keys
 * snapshotted into the deletion outbox), in one transaction, skipping rows
 * an edit or delete holds right now.
 */
export async function sweepDeliverylessLifeUpdates(
  database: PaldoraDatabase,
  now: Date,
  batchSize: number,
): Promise<DeliverylessResult> {
  const tombstoned = await database.transaction(async (transaction) => {
    const anyDelivery = transaction
      .select({ one: sql`1` })
      .from(lifeUpdateDeliveries)
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id));
    const leftovers = await transaction
      .select({ id: lifeUpdates.id })
      .from(lifeUpdates)
      .where(
        and(
          eq(lifeUpdates.status, 'active'),
          eq(lifeUpdates.audience, 'boxes'),
          lt(
            lifeUpdates.createdAt,
            new Date(now.getTime() - DELIVERYLESS_GRACE_MS),
          ),
          notExists(anyDelivery),
        ),
      )
      .orderBy(lifeUpdates.id)
      .limit(batchSize)
      .for('update', { skipLocked: true });
    const ids = leftovers.map((row) => row.id);
    await tombstoneLifeUpdates(transaction, ids, now);
    return ids.length;
  });
  const delivering = database
    .select({ one: sql`1` })
    .from(lifeUpdateDeliveries)
    .where(eq(lifeUpdateDeliveries.postId, posts.id));
  const [orphaned] = await database
    .select({ value: count() })
    .from(posts)
    .where(and(eq(posts.kind, 'life_update'), notExists(delivering)));
  return {
    tombstonedLifeUpdates: tombstoned,
    orphanedBackingPosts: orphaned?.value ?? 0,
  };
}
