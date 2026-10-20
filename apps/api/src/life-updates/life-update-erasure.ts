import {
  lifeUpdateDeliveries,
  lifeUpdates,
  tombstoneLifeUpdates,
  type DatabaseTransaction,
} from '@paldora/database';
import { and, eq, inArray, ne, notExists, sql } from 'drizzle-orm';

/**
 * Called by Box deletion, in its transaction, before the Box row goes (plan
 * decision 8). The Box cascade removes this Box's backing posts with their
 * comments, reactions, and notifications, and its deliveries; a Life Update
 * whose only Box this was would be left with none, so it is tombstoned here
 * and its photos (user-scoped, so the Box's own media sweep never sees
 * them) are retired with their object keys snapshotted first.
 *
 * The Life Updates delivered here are locked `FOR UPDATE` (in ID order)
 * before the "no other Box" check, which runs as a separate statement: two
 * Boxes of one Life Update deleted at once serialize, and the second sees
 * the first's cascade and tombstones it. The worker's deliveryless sweep is
 * the safety net. Imports nothing from other API modules, so no cycle.
 */
export async function tombstoneLifeUpdatesLosingLastBox(
  transaction: DatabaseTransaction,
  boxId: string,
): Promise<string[]> {
  const deliveredHere = transaction
    .select({ id: lifeUpdateDeliveries.lifeUpdateId })
    .from(lifeUpdateDeliveries)
    .where(eq(lifeUpdateDeliveries.boxId, boxId));
  const locked = await transaction
    .select({ id: lifeUpdates.id })
    .from(lifeUpdates)
    .where(
      and(
        inArray(lifeUpdates.id, deliveredHere),
        eq(lifeUpdates.status, 'active'),
      ),
    )
    .orderBy(lifeUpdates.id)
    .for('update');
  if (locked.length === 0) return [];
  const elsewhere = transaction
    .select({ one: sql`1` })
    .from(lifeUpdateDeliveries)
    .where(
      and(
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
        ne(lifeUpdateDeliveries.boxId, boxId),
      ),
    );
  const losing = await transaction
    .select({ id: lifeUpdates.id })
    .from(lifeUpdates)
    .where(
      and(
        inArray(
          lifeUpdates.id,
          locked.map((row) => row.id),
        ),
        eq(lifeUpdates.status, 'active'),
        notExists(elsewhere),
      ),
    );
  const ids = losing.map((row) => row.id);
  await tombstoneLifeUpdates(transaction, ids);
  return ids;
}
