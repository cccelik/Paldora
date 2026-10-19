import type { JobHandler } from '../job-router.js';
import type { OutboxJobData } from '../outbox/dispatcher.js';
import {
  isFinished,
  loadOutboxRow,
  markCompleted,
} from '../outbox/outbox-store.js';
import type { MediaJobDependencies } from './process-media.js';

/**
 * `media.delete`: removes the snapshotted keys. Deleting a missing object
 * succeeds, so retries and duplicate deliveries are harmless.
 */
export function createDeleteMediaHandler(
  dependencies: MediaJobDependencies,
): JobHandler {
  return async (job, { logger }) => {
    const { outboxId } = job.data as OutboxJobData;
    const row = await loadOutboxRow(dependencies.database, outboxId);
    if (!row || isFinished(row)) return;
    const keys = row.payload.objectKeys ?? [];
    await dependencies.storage.delete(keys);
    await markCompleted(dependencies.database, outboxId);
    logger.info({ objects: keys.length }, 'media deleted');
  };
}
