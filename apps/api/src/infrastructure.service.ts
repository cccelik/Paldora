import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { parseServiceEnvironment } from '@paldora/config';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '@paldora/database';
import { Redis } from 'ioredis';

@Injectable()
export class InfrastructureService implements OnApplicationShutdown {
  private readonly database: DatabaseConnection;
  private readonly redis: Redis;

  public constructor() {
    const environment = parseServiceEnvironment(process.env);
    this.database = createDatabaseConnection(environment.DATABASE_URL);
    this.redis = new Redis(environment.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  public async check(): Promise<boolean> {
    try {
      await Promise.all([this.database.check(), this.checkRedis()]);
      return true;
    } catch {
      return false;
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.database.close(), this.closeRedis()]);
  }

  private async checkRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    await this.redis.ping();
  }

  private async closeRedis(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}
