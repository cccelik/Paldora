import 'reflect-metadata';
import { createPerson } from '@paldora/database/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { requireEnvironmentVariables } from '@paldora/config';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  userPreferences,
  type DatabaseConnection,
} from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { MemoryObjectStorage } from '@paldora/storage';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module.js';
import { configureApp } from '../configure-app.js';
import {
  ACCESS_TOKEN_VERIFIER,
  API_ENVIRONMENT,
  LOGGER,
  OBJECT_STORAGE,
} from '../platform/config/tokens.js';
import { LocalIssuer } from './local-issuer.js';

const webOrigin = 'http://web.integration.test';

export interface TestUser {
  readonly id: string;
  readonly subject: string;
  readonly token: string;
  /** Empty for users who have not chosen a username yet. */
  readonly username: string;
}

export interface TestApp {
  readonly baseUrl: string;
  readonly database: DatabaseConnection['database'];
  readonly storage: MemoryObjectStorage;
  readonly issuer: LocalIssuer;
  /** Provisions a user with a profile; `username` implies completed setup. */
  createUser(options?: {
    username?: string;
    displayName?: string;
    status?: 'active' | 'suspended';
  }): Promise<TestUser>;
  request(
    user: TestUser | null,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<Response>;
  /** A fully onboarded person with a unique username. */
  person(prefix?: string): Promise<TestUser>;
  close(): Promise<void>;
}

/**
 * Boots the real AppModule against real PostgreSQL and Redis. Only the
 * identity provider (local issuer) and object storage (in-memory) are
 * replaced. Fails loudly when infrastructure is not configured.
 */
export async function createTestApp(): Promise<TestApp> {
  const { DATABASE_URL, REDIS_URL } = requireEnvironmentVariables(
    ['DATABASE_URL', 'REDIS_URL'],
    process.env,
  );
  const issuer = await LocalIssuer.create();
  const storage = new MemoryObjectStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(API_ENVIRONMENT)
    .useValue({
      PALDORA_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL,
      DATABASE_POOL_MAX: 4,
      REDIS_URL,
      WEB_ORIGIN: webOrigin,
    })
    .overrideProvider(LOGGER)
    .useValue(
      createLogger({
        service: 'api',
        environment: 'test',
        level: process.env.TEST_LOG_LEVEL ?? 'silent',
      }),
    )
    .overrideProvider(ACCESS_TOKEN_VERIFIER)
    .useValue(issuer.verifier)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();
  const app: INestApplication =
    moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
  configureApp(app, { webOrigin, logger: moduleRef.get(LOGGER) });
  await app.listen(0, '127.0.0.1');
  const baseUrl = `${await app.getUrl()}/api/v1`;
  const connection = createDatabaseConnection({
    connectionString: DATABASE_URL ?? '',
    poolMax: 2,
    applicationName: 'paldora-api-test',
  });
  const createdUserIds: string[] = [];

  /**
   * Processing rows point at objects that only ever existed in the in-memory
   * storage, so a real worker sharing this database could never finish them.
   * Retire them; deletion rows are harmless and are left for the worker.
   */
  async function retireProcessingRows(): Promise<void> {
    if (createdUserIds.length === 0) return;
    const assets = connection.database
      .select({ id: sql`${mediaAssets.id}::text` })
      .from(mediaAssets)
      .where(inArray(mediaAssets.ownerUserId, createdUserIds));
    await connection.database
      .update(mediaJobOutbox)
      .set({ status: 'completed', completedAt: new Date() })
      .where(
        and(
          eq(mediaJobOutbox.jobType, 'media.process'),
          inArray(sql`${mediaJobOutbox.payload} ->> 'mediaAssetId'`, assets),
        ),
      );
  }

  const testApp: TestApp = {
    baseUrl,
    database: connection.database,
    storage,
    issuer,
    async createUser(options = {}) {
      const subject = `subject-${randomUUID()}`;
      const id = await createPerson(connection.database, {
        authSubject: subject,
        status: options.status ?? 'active',
        profile: false,
      });
      const user = { id };
      createdUserIds.push(id);
      await connection.database.insert(profiles).values({
        userId: user.id,
        ...(options.username
          ? {
              username: options.username,
              usernameNormalized: options.username.toLowerCase(),
              displayName: options.displayName ?? options.username,
              onboardingState: 'complete' as const,
            }
          : {}),
      });
      await connection.database
        .insert(userPreferences)
        .values({ userId: user.id });
      return {
        id: user.id,
        subject,
        token: await issuer.token(subject),
        username: options.username ?? '',
      };
    },
    person(prefix = 'person') {
      return testApp.createUser({ username: uniqueUsername(prefix) });
    },
    request(user, path, init = {}) {
      const headers = new Headers();
      if (user) headers.set('authorization', `Bearer ${user.token}`);
      if (init.body !== undefined)
        headers.set('content-type', 'application/json');
      return fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    },
    async close() {
      await retireProcessingRows();
      await app.close();
      await connection.close();
    },
  };
  return testApp;
}

/** A unique, valid username for this run. */
export const uniqueUsername = (prefix = 'user') =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
