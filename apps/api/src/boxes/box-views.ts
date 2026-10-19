import {
  boxMemberships,
  boxes,
  type BoxRow,
  type DatabaseExecutor,
} from '@paldora/database';
import type { BoxRole } from '@paldora/domain';
import type { BoxView } from '@paldora/validation';
import { and, eq, inArray, sql } from 'drizzle-orm';

/** Active-member counts for several Boxes in one query. */
export async function memberCounts(
  executor: DatabaseExecutor,
  boxIds: readonly string[],
): Promise<Map<string, number>> {
  if (boxIds.length === 0) return new Map();
  const rows = await executor
    .select({
      boxId: boxMemberships.boxId,
      value: sql<number>`count(*)::int`,
    })
    .from(boxMemberships)
    .where(
      and(
        inArray(boxMemberships.boxId, [...boxIds]),
        eq(boxMemberships.status, 'active'),
      ),
    )
    .groupBy(boxMemberships.boxId);
  return new Map(rows.map((row) => [row.boxId, row.value]));
}

export function toBoxView(
  row: BoxRow,
  role: BoxRole,
  memberCount: number,
): BoxView {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentUserRole: role,
    memberCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** One Box as its member sees it. */
export async function loadBoxView(
  executor: DatabaseExecutor,
  boxId: string,
  role: BoxRole,
): Promise<BoxView | undefined> {
  const [row] = await executor
    .select()
    .from(boxes)
    .where(eq(boxes.id, boxId))
    .limit(1);
  if (!row) return undefined;
  const counts = await memberCounts(executor, [boxId]);
  return toBoxView(row, role, counts.get(boxId) ?? 0);
}
