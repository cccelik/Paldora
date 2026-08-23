import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseApiEnvironment } from '@paldora/config';
import { createLogger } from '@paldora/observability';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { resolveRequestId } from './request-id.js';

const logger = createLogger({
  service: 'api',
  environment: process.env.NODE_ENV ?? 'unknown',
  ...(process.env.LOG_LEVEL ? { level: process.env.LOG_LEVEL } : {}),
});

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });

  app.enableShutdownHooks();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = resolveRequestId(request.header('x-request-id'));
    response.setHeader('x-request-id', requestId);
    const startedAt = performance.now();
    response.on('finish', () => {
      logger.info(
        {
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'request completed',
      );
    });
    next();
  });

  await app.listen(environment.API_PORT, environment.API_HOST);
  logger.info({ port: environment.API_PORT }, 'Paldora API listening');
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Paldora API failed to start');
  process.exitCode = 1;
});
