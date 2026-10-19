import type { PaldoraDatabase } from '@paldora/database';
import type { Logger } from '@paldora/observability';
import type { Queue } from 'bullmq';
import { claimDue, markPublished } from './outbox-store.js';

export const MEDIA_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3_600 },
  removeOnFail: { age: 7 * 24 * 3_600 },
} as const;

export interface OutboxJobData {
  readonly outboxId: string;
}

/**
 * Moves due outbox rows into BullMQ. The outbox ID is the BullMQ job ID, so a
 * row enqueued twice (after a crash between enqueue and `published`) is
 * deduplicated, and handlers re-check the row's status before acting.
 */
export async function dispatchOnce(
  database: PaldoraDatabase,
  queue: Queue,
  batchSize = 50,
): Promise<number> {
  const rows = await claimDue(database, batchSize);
  if (rows.length === 0) return 0;
  await queue.addBulk(
    rows.map((row) => ({
      name: row.jobType,
      data: { outboxId: row.id } satisfies OutboxJobData,
      opts: { ...MEDIA_JOB_OPTIONS, jobId: row.id },
    })),
  );
  await markPublished(
    database,
    rows.map((row) => row.id),
  );
  return rows.length;
}

/**
 * Polls on an interval, never overlapping itself. Safe to run in several
 * worker replicas because claims use `FOR UPDATE SKIP LOCKED`.
 */
export function startDispatcher(options: {
  database: PaldoraDatabase;
  queue: Queue;
  logger: Logger;
  intervalMs: number;
}): { stop(): Promise<void> } {
  let running: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = dispatchOnce(options.database, options.queue)
      .then((count) => {
        if (count > 0) options.logger.debug({ count }, 'outbox dispatched');
      })
      .catch((error: unknown) =>
        options.logger.error({ err: error }, 'outbox dispatch failed'),
      )
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(tick, options.intervalMs);
  tick();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
