import { parseWorkerEnvironment } from '@paldora/config';
import { createDatabaseConnection } from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { S3ObjectStorage } from '@paldora/storage';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  handleMediaJob,
  markFinalProcessingFailure,
} from './media-job-handlers.js';
import { parseMediaAssetId } from './job-payload.js';

const environment = parseWorkerEnvironment(process.env);
const logger = createLogger({
  service: 'worker',
  environment: environment.NODE_ENV,
  level: environment.LOG_LEVEL,
});
const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const eventPublisher = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: 1,
});
const database = createDatabaseConnection(environment.DATABASE_URL);
const storage = new S3ObjectStorage({
  ...(environment.S3_ENDPOINT ? { endpoint: environment.S3_ENDPOINT } : {}),
  region: environment.S3_REGION,
  bucket: environment.S3_BUCKET,
  accessKeyId: environment.S3_ACCESS_KEY_ID,
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
  forcePathStyle: environment.S3_FORCE_PATH_STYLE,
});
const jobDependencies = {
  database: database.database,
  storage,
  eventPublisher,
};

const worker = new Worker(
  environment.MEDIA_JOB_QUEUE_NAME,
  async (job) => {
    await handleMediaJob(job, jobDependencies);
  },
  { connection },
);

worker.on('completed', (job) =>
  logger.info({ jobId: job.id, jobName: job.name }, 'job completed'),
);
worker.on(
  'failed',
  (job, error) =>
    void (async () => {
      logger.error(
        { jobId: job?.id, jobName: job?.name, err: error },
        'job failed',
      );
      if (
        job?.name === 'process-post-image' &&
        job.attemptsMade >= (job.opts.attempts ?? 1)
      ) {
        const mediaAssetId = parseMediaAssetId(job.data);
        await markFinalProcessingFailure(mediaAssetId, jobDependencies);
      }
    })(),
);
worker.on('error', (error) =>
  logger.error({ err: error }, 'worker connection error'),
);
connection.on('error', (error) =>
  logger.error({ err: error }, 'Redis connection error'),
);

async function closeResources(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  await connection.quit();
  await eventPublisher.quit();
  await database.close();
}

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= closeResources(signal);
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
logger.info('Paldora worker listening');
