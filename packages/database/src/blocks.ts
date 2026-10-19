import { and, eq, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { PaldoraDatabase } from './index.js';
import { userBlocks } from './schema.js';

/**
 * Whether either person has blocked the other (ADR 013). This is the one
 * symmetric definition; every query that shows one person to another uses it
 * or `hiddenByBlock`, never its own copy.
 */
export async function isBlockedBetween(
  database: Pick<PaldoraDatabase, 'select'>,
  first: string,
  second: string,
): Promise<boolean> {
  const [row] = await database
    .select({ one: sql<number>`1` })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, first), eq(userBlocks.blockedId, second)),
        and(eq(userBlocks.blockerId, second), eq(userBlocks.blockedId, first)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * A `WHERE` fragment that is true when a block in either direction exists
 * between the viewer and the person in `otherUser`. Use `not(...)` to
 * exclude blocked people from lists, feeds, and counts.
 */
export function hiddenByBlock(viewerId: string, otherUser: AnyColumn): SQL {
  return sql`exists (
    select 1 from ${userBlocks}
    where (${userBlocks.blockerId} = ${viewerId} and ${userBlocks.blockedId} = ${otherUser})
       or (${userBlocks.blockerId} = ${otherUser} and ${userBlocks.blockedId} = ${viewerId})
  )`;
}

/** The canonical (low, high) ordering used by `friendships`. */
export function orderedPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

/**
 * Serializes work on one pair of people for the rest of the transaction.
 *
 * Blocks, friend requests, and Box invitations all decide something about a
 * pair. Without this lock a block could commit between "is anyone blocked?"
 * and "create the relationship", leaving a friendship or invitation that the
 * block should have prevented. With it, the two orderings are the only ones.
 */
export async function lockPair(
  transaction: Pick<PaldoraDatabase, 'execute'>,
  first: string,
  second: string,
): Promise<void> {
  const [low, high] = orderedPair(first, second);
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`pair:${low}:${high}`}, 0))`,
  );
}
