import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { mediaJobOutbox } from '@paldora/database';
import { Queue } from 'bullmq';
import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class MediaJobOutboxDispatcher
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(MediaJobOutboxDispatcher.name);
  private readonly queue: Queue;
  private timer: NodeJS.Timeout | undefined;
  private flushing = false;

  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {
    const redisUrl = new URL(infrastructure.redisUrl);
    this.queue = new Queue(infrastructure.mediaJobQueueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.username ? { username: redisUrl.username } : {}),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
        ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
      },
    });
  }

  public onModuleInit(): void {
    void this.flush();
    this.timer = setInterval(() => void this.flush(), 1_000);
    this.timer.unref();
  }

  public async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const jobs = await this.claimPendingJobs();
      await Promise.all(jobs.map((job) => this.publish(job)));
    } catch (error) {
      this.logger.error('Media outbox dispatch failed.', error);
    } finally {
      this.flushing = false;
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue.close();
  }

  private claimPendingJobs() {
    const now = new Date();
    const staleLock = new Date(now.getTime() - 60_000);
    return this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const jobs = await transaction
          .select()
          .from(mediaJobOutbox)
          .where(
            and(
              isNull(mediaJobOutbox.publishedAt),
              lte(mediaJobOutbox.availableAt, now),
              or(
                isNull(mediaJobOutbox.lockedAt),
                lt(mediaJobOutbox.lockedAt, staleLock),
              ),
            ),
          )
          .orderBy(asc(mediaJobOutbox.createdAt))
          .limit(25)
          .for('update', { skipLocked: true });
        if (jobs.length === 0) return jobs;
        await transaction
          .update(mediaJobOutbox)
          .set({
            lockedAt: now,
            updatedAt: now,
          })
          .where(
            inArray(
              mediaJobOutbox.id,
              jobs.map(({ id }) => id),
            ),
          );
        return jobs;
      },
    );
  }

  private async publish(
    job: typeof mediaJobOutbox.$inferSelect,
  ): Promise<void> {
    const database = this.infrastructure.databaseClient;
    try {
      await this.queue.add(job.jobType, job.payload, {
        jobId: job.id,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
      await database
        .update(mediaJobOutbox)
        .set({
          attempts: job.attempts + 1,
          publishedAt: new Date(),
          lockedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaJobOutbox.id, job.id),
            isNull(mediaJobOutbox.publishedAt),
          ),
        );
    } catch (error) {
      const attempts = job.attempts + 1;
      const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
      await database
        .update(mediaJobOutbox)
        .set({
          attempts,
          availableAt: new Date(Date.now() + delay),
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : String(error),
          updatedAt: new Date(),
        })
        .where(eq(mediaJobOutbox.id, job.id));
    }
  }
}
