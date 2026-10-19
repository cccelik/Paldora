import type { DatabaseTransaction, PaldoraDatabase } from '@paldora/database';
import type { Logger } from '@paldora/observability';
import {
  claimBatch,
  markCompleted,
  recordFailure,
  type ClaimedEvent,
} from './activity-store.js';
import { projectEvent, type CreatedNotification } from './projection-rules.js';
import type { NotificationPublisher } from './realtime-publisher.js';

export const PROJECTOR_BATCH_SIZE = 50;

export type ProjectEvent = (
  executor: DatabaseTransaction,
  event: ClaimedEvent,
) => Promise<CreatedNotification[]>;

export interface BatchResult {
  readonly claimed: number;
  readonly failed: number;
  /** Event IDs that reached `dead` in this batch. */
  readonly dead: readonly string[];
  readonly created: readonly CreatedNotification[];
}

export interface ProjectOptions {
  readonly batchSize?: number;
  /** Replaces the projection of one event (fault injection in tests). */
  readonly project?: ProjectEvent;
}

/**
 * Claims and projects one batch inside the caller's transaction. Each event
 * runs in its own savepoint, so a poison event rolls back only its own work:
 * its failure is recorded and its neighbours still complete. Nothing here
 * touches the network; hints are published after the caller commits.
 */
export async function projectBatch(
  transaction: DatabaseTransaction,
  options: ProjectOptions = {},
): Promise<BatchResult> {
  const project = options.project ?? projectEvent;
  const events = await claimBatch(
    transaction,
    options.batchSize ?? PROJECTOR_BATCH_SIZE,
  );
  const created: CreatedNotification[] = [];
  const dead: string[] = [];
  let failed = 0;
  for (const event of events) {
    try {
      // Sequential by protocol: savepoints nest on one connection, in order.
      // eslint-disable-next-line no-await-in-loop
      const rows = await transaction.transaction(async (savepoint) => {
        const inserted = await project(savepoint, event);
        await markCompleted(savepoint, event.id);
        return inserted;
      });
      created.push(...rows);
    } catch (error) {
      failed += 1;
      // Sequential by protocol: the failure lands in the same transaction.
      // eslint-disable-next-line no-await-in-loop
      if (await recordFailure(transaction, event, error)) dead.push(event.id);
    }
  }
  return { claimed: events.length, failed, dead, created };
}

/** One committed batch, then its hints (best effort, after commit). */
export async function projectOnce(
  database: PaldoraDatabase,
  publisher: NotificationPublisher,
  options: ProjectOptions = {},
): Promise<BatchResult> {
  const result = await database.transaction((transaction) =>
    projectBatch(transaction, options),
  );
  await publisher.notificationsCreated(result.created);
  return result;
}

/**
 * Polls on an interval, never overlapping itself, like the media outbox
 * dispatcher. Safe in several worker replicas: claims use `SKIP LOCKED` and
 * notification keys are unique, so double projection is harmless.
 */
export function startProjector(options: {
  database: PaldoraDatabase;
  publisher: NotificationPublisher;
  logger: Logger;
  intervalMs: number;
}): { stop(): Promise<void> } {
  let running: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = projectOnce(options.database, options.publisher)
      .then((result) => report(options.logger, result))
      .catch((error: unknown) =>
        options.logger.error({ err: error }, 'activity projection failed'),
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

function report(logger: Logger, result: BatchResult): void {
  for (const eventId of result.dead) {
    // Alerting hooks into this log line until metrics exist.
    logger.error({ eventId }, 'activity event dead-lettered');
  }
  if (result.failed > 0) {
    logger.warn({ failed: result.failed }, 'activity events failed');
  }
  if (result.claimed > 0) {
    logger.debug(
      { claimed: result.claimed, created: result.created.length },
      'activity projected',
    );
  }
}
