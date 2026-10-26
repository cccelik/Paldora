import { randomUUID } from 'node:crypto';

/** Minimal structured logging: allowlisted keys, redacted values, no message text. */
export type LogSink = (line: string) => void;
export type LogSeverity = 'INFO' | 'WARNING' | 'ERROR';

const allowedKeys = new Set([
  'event',
  'requestId',
  'jobId',
  'route',
  'status',
  'code',
  'durationMs',
  'count',
  'errorName',
]);
const sensitive = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
  /https?:\/\/\S*\?/u,
  /bearer\s/iu,
  /eyJ[\w-]+\.[\w-]+\.[\w-]*/u,
  /x-goog-signature/iu,
  /token=/iu,
];
const requestIdPattern = /^[A-Za-z0-9-]{1,64}$/u;
const nativeErrorName = /^Native[A-Za-z]*Error$/u;

let sink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Replace the sink (tests, or a platform logger). Returns the previous sink. */
export function setLogSink(next: LogSink): LogSink {
  const previous = sink;
  sink = next;
  return previous;
}

export function requestIdFrom(header: string | null | undefined): string {
  return header && requestIdPattern.test(header) ? header : randomUUID();
}

function clean(value: unknown): unknown {
  if (typeof value === 'string')
    return sensitive.some((pattern) => pattern.test(value))
      ? '[redacted]'
      : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

/** Safe fields for an error: its class name, plus code for Native*Error only. Never the message. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorName: 'NonError' };
  const className = error.constructor.name;
  if (nativeErrorName.test(className)) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string'
      ? { errorName: className, code }
      : { errorName: className };
  }
  return {
    errorName: /^[A-Za-z]{1,40}$/u.test(error.name) ? error.name : 'Error',
  };
}

export function logEvent(
  severity: LogSeverity,
  fields: Record<string, unknown>,
  error?: unknown,
): void {
  const entry: Record<string, unknown> = { severity };
  const source =
    error === undefined ? fields : { ...fields, ...errorFields(error) };
  for (const [key, value] of Object.entries(source)) {
    if (!allowedKeys.has(key)) continue;
    const safe = clean(value);
    if (safe !== undefined) entry[key] = safe;
  }
  sink(JSON.stringify(entry));
}
