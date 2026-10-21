import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ApiEnvironment } from '@paldora/config';
import {
  createDatabaseConnection,
  type DatabaseConnection,
  type PaldoraDatabase,
} from '@paldora/database';
import { Redis } from 'ioredis';
import { redisReady } from './redis-ready.js';
import { API_ENVIRONMENT } from './tokens.js';

export interface Infrastructure {
  readonly database: PaldoraDatabase;
  readonly redis: Redis;
  /** True only when PostgreSQL and Redis both answer. */
  isReady(): Promise<boolean>;
}

/**
 * Owns the process-wide PostgreSQL pool and Redis connection. Redis commands
 * fail fast instead of queueing while disconnected, so callers can fail closed.
 */
@Injectable()
export class InfrastructureService
  implements Infrastructure, OnApplicationShutdown
{
  private readonly connection: DatabaseConnection;
  public readonly redis: Redis;

  public constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.connection = createDatabaseConnection({
      connectionString: environment.DATABASE_URL,
      poolMax: environment.DATABASE_POOL_MAX,
      applicationName: 'paldora-api',
    });
    this.redis = new Redis(environment.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    // Errors surface through the failing command; avoid unhandled events.
    this.redis.on('error', () => undefined);
  }

  public get database(): PaldoraDatabase {
    return this.connection.database;
  }

  public async isReady(): Promise<boolean> {
    try {
      await Promise.all([this.connection.check(), this.pingRedis()]);
      return true;
    } catch {
      return false;
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.connection.close(),
      this.redis.status === 'end' ? Promise.resolve() : this.redis.quit(),
    ]);
  }

  private async pingRedis(): Promise<void> {
    await redisReady(this.redis);
    await this.redis.ping();
  }
}
