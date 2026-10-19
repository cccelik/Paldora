import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';

export type { Logger } from 'pino';

/**
 * Field names that may carry credentials or private content. They are redacted
 * at any of the first three nesting levels. Log structured identifiers instead
 * of bodies: post/comment text, signed URLs, and image data never belong in
 * logs.
 */
const sensitiveKeys = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'signedUrl',
  'body',
  'content',
] as const;

const redactPaths = sensitiveKeys.flatMap((key) => [
  `["${key}"]`,
  `*["${key}"]`,
  `*.*["${key}"]`,
]);

export interface LoggerContext {
  service: string;
  environment: string;
  level?: string;
}

export function createLogger(
  context: LoggerContext,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    base: { service: context.service, environment: context.environment },
    level: context.level ?? 'info',
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return destination ? pino(options, destination) : pino(options);
}

/**
 * Removes query strings and fragments, which is where signed-URL credentials
 * and tokens live, before a URL or path is logged.
 */
export function urlForLog(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}
