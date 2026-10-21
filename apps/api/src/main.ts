import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiEnvironment } from '@paldora/config';
import type { Logger } from '@paldora/observability';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { API_ENVIRONMENT, LOGGER } from './platform/config/tokens.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    bodyParser: false,
    logger: false,
  });
  const environment = app.get<ApiEnvironment>(API_ENVIRONMENT);
  const logger = app.get<Logger>(LOGGER);
  configureApp(app, { webOrigin: environment.WEB_ORIGIN, logger });
  await app.listen(environment.API_PORT, environment.API_HOST);
  logger.info({ port: environment.API_PORT }, 'Paldora API listening');
}

void bootstrap().catch((error: unknown) => {
  // Configuration errors name keys, never values, so they are safe to print.
  console.error('Paldora API failed to start:', error);
  process.exitCode = 1;
});
