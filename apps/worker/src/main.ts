import { parseServiceEnvironment } from '@paldora/config';
import { createLogger } from '@paldora/observability';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

const environment = parseServiceEnvironment(process.env);
const logger = createLogger({
  service: 'worker',
  environment: environment.NODE_ENV,
  level: environment.LOG_LEVEL,
});
const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'paldora-jobs',
  async (job) => {
    logger.warn(
      { jobId: job.id, jobName: job.name },
      'No job handler registered; job rejected',
    );
    throw new Error(`Unsupported job type: ${job.name}`);
  },
  { connection },
);

worker.on('completed', (job) =>
  logger.info({ jobId: job.id, jobName: job.name }, 'job completed'),
);
worker.on('failed', (job, error) =>
  logger.error({ jobId: job?.id, jobName: job?.name, error }, 'job failed'),
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  await connection.quit();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
logger.info('Paldora worker listening');
