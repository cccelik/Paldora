import pino, { type Logger, type LoggerOptions } from 'pino';

const redactPaths = [
  'authorization',
  'cookie',
  'password',
  'req.headers.authorization',
  'req.headers.cookie',
  'token',
  '*.password',
  '*.token',
];

export interface LoggerContext {
  service: string;
  environment: string;
  level?: string;
}

export function createLogger(context: LoggerContext): Logger {
  const options: LoggerOptions = {
    base: { service: context.service, environment: context.environment },
    level: context.level ?? 'info',
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return pino(options);
}
