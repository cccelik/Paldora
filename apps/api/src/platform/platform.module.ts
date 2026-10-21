import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { parseApiEnvironment, type ApiEnvironment } from '@paldora/config';
import { createLogger } from '@paldora/observability';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { S3ObjectStorage } from '@paldora/storage';
import { createSupabaseTokenVerifier } from './auth/access-token-verifier.js';
import { AuthGuard } from './auth/auth.guard.js';
import { DatabasePrincipalResolver } from './auth/principal-resolver.js';
import { HealthController } from './http/health.controller.js';
import {
  InfrastructureService,
  type Infrastructure,
} from './db/infrastructure.service.js';
import { RateLimitGuard } from './rate-limit/rate-limit.guard.js';
import { RedisRateLimiter } from './rate-limit/rate-limiter.js';
import {
  ACCESS_TOKEN_VERIFIER,
  API_ENVIRONMENT,
  DATABASE,
  INFRASTRUCTURE,
  LOGGER,
  OBJECT_STORAGE,
  PRINCIPAL_RESOLVER,
  RATE_LIMITER,
} from './config/tokens.js';

/**
 * Cross-cutting runtime: configuration, infrastructure, storage,
 * authentication (token verification and principal mapping), rate limiting,
 * error mapping, and health. Feature modules depend on these
 * tokens and never construct infrastructure themselves.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: () => parseApiEnvironment(process.env),
    },
    {
      provide: LOGGER,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment) =>
        createLogger({
          service: 'api',
          environment: environment.PALDORA_ENV,
          level: environment.LOG_LEVEL,
        }),
    },
    InfrastructureService,
    { provide: INFRASTRUCTURE, useExisting: InfrastructureService },
    // Services that need only PostgreSQL inject this; Redis users keep
    // INFRASTRUCTURE.
    {
      provide: DATABASE,
      inject: [INFRASTRUCTURE],
      useFactory: (infrastructure: Infrastructure) => infrastructure.database,
    },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [API_ENVIRONMENT],
      useFactory: createSupabaseTokenVerifier,
    },
    { provide: PRINCIPAL_RESOLVER, useClass: DatabasePrincipalResolver },
    {
      provide: OBJECT_STORAGE,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment) =>
        new S3ObjectStorage({
          endpoint: environment.S3_ENDPOINT,
          region: environment.S3_REGION,
          bucket: environment.S3_BUCKET,
          accessKeyId: environment.S3_ACCESS_KEY_ID,
          secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
          forcePathStyle: environment.S3_FORCE_PATH_STYLE,
        }),
    },
    {
      provide: RATE_LIMITER,
      inject: [InfrastructureService],
      useFactory: (infrastructure: InfrastructureService) =>
        new RedisRateLimiter(infrastructure.redis),
    },
    // Guard order matters: identity first, then per-identity limits.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [
    API_ENVIRONMENT,
    LOGGER,
    INFRASTRUCTURE,
    DATABASE,
    ACCESS_TOKEN_VERIFIER,
    OBJECT_STORAGE,
    // Services enforce body-dependent limits (e.g. camera uploads) directly.
    RATE_LIMITER,
  ],
})
export class PlatformModule {}
