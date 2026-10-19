import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  type PaldoraDatabase,
} from '@paldora/database';
import { UPLOAD_COMPLETION_GRACE_SECONDS } from '@paldora/domain';
import { and, count, eq, inArray, lt } from 'drizzle-orm';

/** A published row whose job left Redis without finishing (e.g. a flush). */
export const STALLED_PUBLISH_MS = 30 * 60 * 1_000;
const batchSize = 200;

export interface ReapResult {
  readonly expiredUploads: number;
  readonly requeued: number;
  readonly dead: number;
}

/** Reservations never completed: fail them and delete whatever arrived. */
async function expireAbandonedUploads(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - UPLOAD_COMPLETION_GRACE_SECONDS * 1_000,
  );
  return database.transaction(async (transaction) => {
    const abandoned = await transaction
      .select({
        id: mediaAssets.id,
        uploadObjectKey: mediaAssets.uploadObjectKey,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.status, 'pending'),
          lt(mediaAssets.uploadExpiresAt, cutoff),
        ),
      )
      .limit(batchSize)
      .for('update', { skipLocked: true });
    if (abandoned.length === 0) return 0;
    await transaction
      .update(mediaAssets)
      .set({ status: 'failed', failureReason: 'expired', updatedAt: now })
      .where(
        inArray(
          mediaAssets.id,
          abandoned.map((asset) => asset.id),
        ),
      );
    await transaction
      .insert(mediaJobOutbox)
      .values(
        abandoned.map((asset) => mediaDeletionJob([asset.uploadObjectKey])),
      );
    return abandoned.length;
  });
}

/** Hands stalled rows back to the dispatcher; job IDs keep this idempotent. */
async function requeueStalled(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const requeued = await database
    .update(mediaJobOutbox)
    .set({ status: 'pending', claimedAt: null, updatedAt: now })
    .where(
      and(
        eq(mediaJobOutbox.status, 'published'),
        lt(
          mediaJobOutbox.publishedAt,
          new Date(now.getTime() - STALLED_PUBLISH_MS),
        ),
      ),
    )
    .returning({ id: mediaJobOutbox.id });
  return requeued.length;
}

/**
 * Scheduled maintenance (R4). Phase 4 adds retries of dead deletions with
 * alerting and outbox retention; today dead rows are counted and logged.
 */
export async function reap(
  database: PaldoraDatabase,
  now = new Date(),
): Promise<ReapResult> {
  const expiredUploads = await expireAbandonedUploads(database, now);
  const requeued = await requeueStalled(database, now);
  const [deadRows] = await database
    .select({ value: count() })
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.status, 'dead'));
  return { expiredUploads, requeued, dead: deadRows?.value ?? 0 };
}
