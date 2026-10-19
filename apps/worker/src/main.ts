import { parseWorkerEnvironment } from '@paldora/config';
import { createDatabaseConnection } from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { S3ObjectStorage } from '@paldora/storage';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createJobRouter } from './job-router.js';
import {
  createJobHandlers,
  MAINTENANCE_REAPER_EVERY_MS,
  MAINTENANCE_REAPER_JOB,
  MAINTENANCE_REAPER_SCHEDULER,
} from './jobs.js';
import { startDispatcher } from './outbox/dispatcher.js';
import { recordJobFailure } from './outbox/failures.js';

const environment = parseWorkerEnvironment(process.env);
const logger = createLogger({
  service: 'worker',
  environment: environment.PALDORA_ENV,
  level: environment.LOG_LEVEL,
});

const connection = createDatabaseConnection({
  connectionString: environment.DATABASE_URL,
  poolMax: environment.DATABASE_POOL_MAX,
  applicationName: 'paldora-worker',
});
const storage = new S3ObjectStorage({
  endpoint: environment.S3_ENDPOINT,
  region: environment.S3_REGION,
  bucket: environment.S3_BUCKET,
  accessKeyId: environment.S3_ACCESS_KEY_ID,
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
  forcePathStyle: environment.S3_FORCE_PATH_STYLE,
});

// BullMQ workers require unlimited per-request retries on their connection.
const workerConnection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
// Producers fail fast instead of buffering while Redis is unreachable.
const queueConnection = new Redis(environment.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
for (const redis of [workerConnection, queueConnection]) {
  redis.on('error', (error) =>
    logger.error({ err: error }, 'Redis connection error'),
  );
}

const queue = new Queue(environment.JOB_QUEUE_NAME, {
  connection: queueConnection,
});
const worker = new Worker(
  environment.JOB_QUEUE_NAME,
  createJobRouter(
    createJobHandlers({ database: connection.database, storage }),
    { logger },
  ),
  { connection: workerConnection, concurrency: environment.WORKER_CONCURRENCY },
);

worker.on('failed', (job, error) => {
  logger.warn(
    {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      err: error,
    },
    'job failed',
  );
  void recordJobFailure(connection.database, logger, job, error).catch(
    (recordError: unknown) =>
      logger.error(
        { err: recordError, jobId: job?.id },
        'failure not recorded',
      ),
  );
});
worker.on('error', (error) => logger.error({ err: error }, 'worker error'));

const dispatcher = startDispatcher({
  database: connection.database,
  queue,
  logger,
  intervalMs: environment.OUTBOX_POLL_INTERVAL_MS,
});

async function scheduleMaintenance(): Promise<void> {
  await queue.upsertJobScheduler(
    MAINTENANCE_REAPER_SCHEDULER,
    { every: MAINTENANCE_REAPER_EVERY_MS },
    {
      name: MAINTENANCE_REAPER_JOB,
      data: {},
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    },
  );
}

let shutdown: Promise<void> | undefined;
function stop(signal: string): Promise<void> {
  shutdown ??= (async () => {
    logger.info({ signal }, 'worker shutting down');
    // Stop producing, then finish in-flight jobs before closing connections.
    await dispatcher.stop();
    await worker.close();
    await queue.close();
    await Promise.allSettled([
      workerConnection.quit(),
      queueConnection.quit(),
      connection.close(),
    ]);
  })();
  return shutdown;
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

void scheduleMaintenance()
  .then(() =>
    logger.info(
      { queue: environment.JOB_QUEUE_NAME },
      'Paldora worker listening',
    ),
  )
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'worker failed to start');
    void stop('startup-failure').finally(() => {
      process.exitCode = 1;
    });
  });
