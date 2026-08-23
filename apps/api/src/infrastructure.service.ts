import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { parseServiceEnvironment } from '@paldora/config';
import {
  createDatabaseConnection,
  type DatabaseConnection,
  type PaldoraDatabase,
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

  public get databaseClient(): PaldoraDatabase {
    return this.database.database;
  }

  public async incrementRateLimit(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    await this.connectRedis();
    const result = await this.redis.eval(
      `local current = redis.call('INCR', KEYS[1])
       if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       return current`,
      1,
      key,
      windowSeconds,
    );
    return Number(result);
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.database.close(), this.closeRedis()]);
  }

  private async checkRedis(): Promise<void> {
    await this.connectRedis();
    await this.redis.ping();
  }

  private async connectRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  private async closeRedis(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}
