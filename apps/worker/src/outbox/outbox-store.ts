import {
  mediaJobOutbox,
  type MediaJobOutboxRow,
  type PaldoraDatabase,
} from '@paldora/database';
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

type Transaction = Parameters<Parameters<PaldoraDatabase['transaction']>[0]>[0];
export type Executor = PaldoraDatabase | Transaction;

/** A claim not followed by `published` within this window is retried. */
export const CLAIM_LEASE_MS = 60_000;

/**
 * Claims a batch of due rows in a short transaction and commits before any
 * network call. Concurrent dispatchers skip each other's locked rows.
 */
export async function claimDue(
  database: PaldoraDatabase,
  limit: number,
  now = new Date(),
): Promise<MediaJobOutboxRow[]> {
  const leaseExpired = new Date(now.getTime() - CLAIM_LEASE_MS);
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select({ id: mediaJobOutbox.id })
      .from(mediaJobOutbox)
      .where(
        and(
          eq(mediaJobOutbox.status, 'pending'),
          lte(mediaJobOutbox.availableAt, now),
          or(
            isNull(mediaJobOutbox.claimedAt),
            lt(mediaJobOutbox.claimedAt, leaseExpired),
          ),
        ),
      )
      .orderBy(asc(mediaJobOutbox.availableAt), asc(mediaJobOutbox.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    return transaction
      .update(mediaJobOutbox)
      .set({ claimedAt: now, updatedAt: now })
      .where(
        inArray(
          mediaJobOutbox.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });
}

export async function markPublished(
  database: PaldoraDatabase,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await database
    .update(mediaJobOutbox)
    .set({
      status: 'published',
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(mediaJobOutbox.id, [...ids]),
        eq(mediaJobOutbox.status, 'pending'),
      ),
    );
}

export async function loadOutboxRow(
  database: PaldoraDatabase,
  id: string,
): Promise<MediaJobOutboxRow | undefined> {
  const [row] = await database
    .select()
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.id, id))
    .limit(1);
  return row;
}

export const isFinished = (row: MediaJobOutboxRow) =>
  row.status === 'completed' || row.status === 'dead';

/** Marks success inside the same transaction as the job's own effects. */
export async function markCompleted(
  executor: Executor,
  id: string,
): Promise<void> {
  await executor
    .update(mediaJobOutbox)
    .set({
      status: 'completed',
      completedAt: new Date(),
      attempts: sql`${mediaJobOutbox.attempts} + 1`,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(mediaJobOutbox.id, id));
}

/** Records a failed attempt; `dead` when retries are exhausted. */
export async function recordFailure(
  executor: Executor,
  id: string,
  options: { error: string; dead: boolean },
): Promise<void> {
  await executor
    .update(mediaJobOutbox)
    .set({
      attempts: sql`${mediaJobOutbox.attempts} + 1`,
      lastError: options.error.slice(0, 500),
      ...(options.dead ? { status: 'dead' as const } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaJobOutbox.id, id),
        inArray(mediaJobOutbox.status, ['pending', 'published']),
      ),
    );
}
