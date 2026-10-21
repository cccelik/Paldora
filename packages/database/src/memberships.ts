import { and, eq, inArray, type AnyColumn, type SQL } from 'drizzle-orm';
import { boxMemberships } from './schema.js';

const isIdList = (value: unknown): value is readonly string[] =>
  Array.isArray(value);

/**
 * The one definition of "this person is an active member of this Box": a
 * `box_memberships` row for the pair whose status is `active`. Left and
 * removed rows keep their history but grant nothing. Use it as a join
 * condition, `innerJoin(boxMemberships, activeMembership(posts.boxId,
 * viewerId))`, or in a `WHERE` over `box_memberships`. `boxId` may be one
 * ID, a column or expression, or a list of IDs (any of them).
 *
 * Raw-SQL fragments that cannot call this (the notification visibility
 * check) must say the same thing; a unit test cross-checks them.
 */
export function activeMembership(
  boxId: string | readonly string[] | AnyColumn | SQL,
  userId: string | AnyColumn | SQL,
): SQL | undefined {
  return and(
    isIdList(boxId)
      ? inArray(boxMemberships.boxId, [...boxId])
      : eq(boxMemberships.boxId, boxId),
    eq(boxMemberships.userId, userId),
    eq(boxMemberships.status, 'active'),
  );
}
