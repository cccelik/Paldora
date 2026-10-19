import { mediaAssets, type PaldoraDatabase } from '@paldora/database';
import type { Logger } from '@paldora/observability';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { failAsset } from '../media/process-media.js';
import type { OutboxJobData } from './dispatcher.js';
import { loadOutboxRow, recordFailure } from './outbox-store.js';

/**
 * Mirrors BullMQ failures into PostgreSQL. A job out of attempts becomes
 * `dead` there, so nothing is silently dropped: the reaper and alerts read
 * the outbox, not Redis.
 */
export async function recordJobFailure(
  database: PaldoraDatabase,
  logger: Logger,
  job: Job | undefined,
  error: Error,
): Promise<void> {
  const outboxId = (job?.data as OutboxJobData | undefined)?.outboxId;
  if (!job || !outboxId) return;
  const dead = job.attemptsMade >= (job.opts.attempts ?? 1);
  const row = await loadOutboxRow(database, outboxId);
  if (!row) return;
  await database.transaction(async (transaction) => {
    await recordFailure(transaction, outboxId, { error: error.message, dead });
    if (!dead || row.jobType !== 'media.process' || !row.payload.mediaAssetId) {
      return;
    }
    const [asset] = await transaction
      .select({
        id: mediaAssets.id,
        uploadObjectKey: mediaAssets.uploadObjectKey,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, row.payload.mediaAssetId));
    if (asset) await failAsset(transaction, asset, 'processing_exhausted');
  });
  if (dead) {
    // Alerting hooks into this log line until metrics exist (Phase 4).
    logger.error(
      { outboxId, jobName: job.name, attemptsMade: job.attemptsMade },
      'outbox job dead-lettered',
    );
  }
}
