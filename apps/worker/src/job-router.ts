import type { Logger } from '@paldora/observability';
import { UnrecoverableError, type Job } from 'bullmq';

export interface JobContext {
  readonly logger: Logger;
}

export type JobHandler = (job: Job, context: JobContext) => Promise<void>;

/**
 * Dispatches by job name. Unknown names are unrecoverable: retrying cannot
 * help, and silently dropping them would lose durable intent. Each phase that
 * adds a job type registers its handler here. Durable intent always lives in a
 * PostgreSQL outbox first, so BullMQ only carries outbox IDs.
 */
export function createJobRouter(
  handlers: Readonly<Record<string, JobHandler>>,
  context: JobContext,
) {
  return async (job: Job): Promise<void> => {
    const handler = handlers[job.name];
    if (!handler) {
      throw new UnrecoverableError(
        `No handler registered for job ${job.name}.`,
      );
    }
    const logger = context.logger.child({ jobId: job.id, jobName: job.name });
    await handler(job, { logger });
  };
}
