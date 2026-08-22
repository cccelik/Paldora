import { parseWorkerEnvironment } from '@paldora/config';
import { createDatabaseConnection, mediaAssets } from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { S3ObjectStorage } from '@paldora/storage';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';

const environment = parseWorkerEnvironment(process.env);
const logger = createLogger({
  service: 'worker',
  environment: environment.NODE_ENV,
  level: environment.LOG_LEVEL,
});
const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
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

const worker = new Worker(
  'paldora-jobs',
  async (job) => {
    if (job.name === 'delete-media-object') {
      const data = job.data as { mediaAssetId: string; objectKey: string };
      await storage.deleteObject(data.objectKey);
      await database.database
        .delete(mediaAssets)
        .where(eq(mediaAssets.id, data.mediaAssetId));
      return;
    }
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
  await database.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
logger.info('Paldora worker listening');
