import { VersioningType, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Logger } from '@paldora/observability';
import helmet from 'helmet';
import { requestContextMiddleware } from './platform/request-context.js';

export interface HttpConfiguration {
  webOrigin: string;
  logger: Logger;
}

/**
 * HTTP edge shared by the server and the platform tests, so tests exercise
 * the exact production pipeline: correlation, headers, CORS, size limits,
 * and `/api/v1` routing.
 */
export function configureApp(
  app: INestApplication,
  configuration: HttpConfiguration,
): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  express.use(requestContextMiddleware(configuration.logger));
  express.use(
    helmet({
      // The API serves JSON only; nothing may render, frame, or load from it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  express.useBodyParser('json', { limit: '256kb' });
  express.enableCors({
    // Exact origin only. Bearer tokens travel in headers, so no cookies.
    origin: configuration.webOrigin,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });
  express.setGlobalPrefix('api');
  express.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  express.enableShutdownHooks();
}
