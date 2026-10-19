import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  postMedia,
  storedObjectKeys,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  UNATTACHED_MEDIA_TTL_SECONDS,
  UPLOAD_COMPLETION_GRACE_SECONDS,
} from '@paldora/domain';
import { and, count, eq, inArray, lt, notExists, sql } from 'drizzle-orm';

/** A published row whose job left Redis without finishing (e.g. a flush). */
export const STALLED_PUBLISH_MS = 30 * 60 * 1_000;
/** Dead deletions are retried after this long, up to `MAX_DELETE_ATTEMPTS`. */
export const DEAD_RETRY_AFTER_MS = 60 * 60 * 1_000;
export const MAX_DELETE_ATTEMPTS = 25;
/** Finished outbox rows are history; keep a month, then purge. */
export const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const batchSize = 200;
const purgeBatchSize = 1_000;

export interface ReapResult {
  readonly expiredUploads: number;
  readonly expiredPhotos: number;
  readonly requeued: number;
  readonly retriedDeletions: number;
  readonly purged: number;
  /** Rows still dead after this run: these need a human. */
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

/**
 * Ready post photos no post ever claimed (the author closed the composer, or
 * the post failed). They are removed with every object they own.
 */
async function expireUnattachedPhotos(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - UNATTACHED_MEDIA_TTL_SECONDS * 1_000);
  return database.transaction(async (transaction) => {
    const orphaned = await transaction
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.purpose, 'post_image'),
          eq(mediaAssets.status, 'ready'),
          lt(mediaAssets.updatedAt, cutoff),
          notExists(
            transaction
              .select({ one: sql`1` })
              .from(postMedia)
              .where(eq(postMedia.mediaAssetId, mediaAssets.id)),
          ),
        ),
      )
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
 * A failed deletion leaves a stored object nobody can reach, so it is retried
 * for a long while (a storage outage should not strand files). Processing
 * jobs are not retried here: their asset is already marked failed.
 */
async function retryDeadDeletions(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const retried = await database
    .update(mediaJobOutbox)
    .set({
      status: 'pending',
      claimedAt: null,
      availableAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(mediaJobOutbox.status, 'dead'),
        eq(mediaJobOutbox.jobType, 'media.delete'),
        lt(mediaJobOutbox.attempts, MAX_DELETE_ATTEMPTS),
        lt(
          mediaJobOutbox.updatedAt,
          new Date(now.getTime() - DEAD_RETRY_AFTER_MS),
        ),
      ),
    )
    .returning({ id: mediaJobOutbox.id });
  return retried.length;
}

async function purgeFinished(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
  const finished = database
    .select({ id: mediaJobOutbox.id })
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.status, 'completed'),
        lt(mediaJobOutbox.completedAt, cutoff),
      ),
    )
    .limit(purgeBatchSize);
  const purged = await database
    .delete(mediaJobOutbox)
    .where(inArray(mediaJobOutbox.id, finished))
    .returning({ id: mediaJobOutbox.id });
  return purged.length;
}

/**
 * Scheduled maintenance (R4). Every step is bounded and safe to repeat; two
 * workers running it at once cannot double-process a row (`SKIP LOCKED` and
 * conditional updates).
 */
export async function reap(
  database: PaldoraDatabase,
  now = new Date(),
): Promise<ReapResult> {
  const expiredUploads = await expireAbandonedUploads(database, now);
  const expiredPhotos = await expireUnattachedPhotos(database, now);
  const requeued = await requeueStalled(database, now);
  const retriedDeletions = await retryDeadDeletions(database, now);
  const purged = await purgeFinished(database, now);
  const [deadRows] = await database
    .select({ value: count() })
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.status, 'dead'));
  return {
    expiredUploads,
    expiredPhotos,
    requeued,
    retriedDeletions,
    purged,
    dead: deadRows?.value ?? 0,
  };
}
