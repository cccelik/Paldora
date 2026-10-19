import {
  activityEvents,
  type ActivityEventRow,
  type DatabaseExecutor,
  type DatabaseTransaction,
} from '@paldora/database';
import { and, asc, eq, lte, sql } from 'drizzle-orm';

/** After this many failed attempts an event is `dead` and needs a human. */
export const MAX_ACTIVITY_ATTEMPTS = 8;
export const ACTIVITY_BACKOFF_BASE_MS = 500;
export const ACTIVITY_BACKOFF_CAP_MS = 60_000;
/** Jitter adds up to this fraction of the delay, so retries spread out. */
const jitterFraction = 0.2;

export type ClaimedEvent = Pick<
  ActivityEventRow,
  'id' | 'type' | 'attempts' | 'dedupeKey'
>;

/**
 * Locks a batch of due events for the rest of the caller's transaction.
 * Concurrent projectors skip each other's rows, and a crash before commit
 * releases the locks with the rows still pending, so no lease is needed.
 */
export function claimBatch(
  transaction: DatabaseTransaction,
  limit: number,
  now = new Date(),
): Promise<ClaimedEvent[]> {
  return transaction
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      attempts: activityEvents.attempts,
      dedupeKey: activityEvents.dedupeKey,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.status, 'pending'),
        lte(activityEvents.availableAt, now),
      ),
    )
    .orderBy(asc(activityEvents.availableAt), asc(activityEvents.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });
}

/** Done, whether it made a notification or was skipped by a rule. */
export async function markCompleted(
  executor: DatabaseExecutor,
  id: string,
  now = new Date(),
): Promise<void> {
  await executor
    .update(activityEvents)
    .set({
      status: 'completed',
      completedAt: now,
      attempts: sql`${activityEvents.attempts} + 1`,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(activityEvents.id, id));
}

/** `min(cap, base × 2^attempts)` plus up to 20% jitter. */
export function backoffMs(attempts: number, random = Math.random): number {
  const delay = Math.min(
    ACTIVITY_BACKOFF_CAP_MS,
    ACTIVITY_BACKOFF_BASE_MS * 2 ** attempts,
  );
  return Math.round(delay + random() * delay * jitterFraction);
}

/**
 * Records one failed attempt: retried later with backoff, or `dead` once
 * `MAX_ACTIVITY_ATTEMPTS` is reached. Returns whether it is now dead.
 */
export async function recordFailure(
  executor: DatabaseExecutor,
  event: ClaimedEvent,
  error: unknown,
  now = new Date(),
): Promise<boolean> {
  const attempts = event.attempts + 1;
  const dead = attempts >= MAX_ACTIVITY_ATTEMPTS;
  const message = error instanceof Error ? error.message : String(error);
  await executor
    .update(activityEvents)
    .set({
      attempts,
      lastError: message.slice(0, 500),
      updatedAt: now,
      ...(dead
        ? { status: 'dead' as const }
        : {
            availableAt: new Date(now.getTime() + backoffMs(event.attempts)),
          }),
    })
    .where(
      and(
        eq(activityEvents.id, event.id),
        eq(activityEvents.status, 'pending'),
      ),
    );
  return dead;
}
