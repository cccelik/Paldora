import { boxes, type DatabaseExecutor } from '@paldora/database';
import { asc, eq, inArray } from 'drizzle-orm';
import { boxArchived, boxNotFound } from './box-errors.js';

/**
 * Holds the Box row `FOR SHARE` until commit, so archiving cannot slip in
 * between a check and a write; archived Boxes are read-only (BOX_ARCHIVED).
 * A missing row answers `missing` (BOX_ARCHIVED unless the caller needs the
 * non-leaking code of its own resource, such as BOX_NOT_FOUND).
 */
export async function lockOpenBox(
  transaction: DatabaseExecutor,
  boxId: string,
  options: { readonly missing?: () => Error } = {},
): Promise<void> {
  const [box] = await transaction
    .select({ status: boxes.status })
    .from(boxes)
    .where(eq(boxes.id, boxId))
    .for('share')
    .limit(1);
  if (!box) throw (options.missing ?? boxArchived)();
  if (box.status !== 'active') throw boxArchived();
}

/**
 * Locks several Box rows `FOR SHARE` in ascending ID order, the one order
 * every multi-Box writer uses, so concurrent writers never deadlock. Any
 * missing Box answers BOX_NOT_FOUND (never saying which); any archived one,
 * BOX_ARCHIVED.
 */
export async function lockOpenBoxes(
  transaction: DatabaseExecutor,
  boxIds: readonly string[],
): Promise<void> {
  const locked = await transaction
    .select({ id: boxes.id, status: boxes.status })
    .from(boxes)
    .where(inArray(boxes.id, [...boxIds]))
    .orderBy(asc(boxes.id))
    .for('share');
  if (locked.length !== boxIds.length) throw boxNotFound();
  if (locked.some((box) => box.status !== 'active')) throw boxArchived();
}
