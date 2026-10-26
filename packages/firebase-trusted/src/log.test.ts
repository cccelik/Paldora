import { afterEach, describe, expect, it } from 'vitest';
import { logEvent, requestIdFrom, setLogSink } from './log.js';
import { NativeMediaError } from './native-media.js';

const secrets = [
  'secret body text',
  'a@b.co',
  'https://storage.googleapis.com/x/y?X-Goog-Signature=abc',
  'Bearer abc123',
  'eyJhbGciOi.eyJzdWIiOi.sig',
];

describe('logEvent', () => {
  const lines: string[] = [];
  const previous = setLogSink((line) => lines.push(line));
  afterEach(() => {
    lines.length = 0;
  });

  it('drops unknown keys and redacts sensitive values', () => {
    logEvent('ERROR', {
      event: 'x',
      body: secrets[0],
      email: secrets[1],
      route: secrets[2],
      jobId: secrets[3],
      code: secrets[4],
      status: 503,
    });
    const out = lines.join('\n');
    for (const secret of secrets) expect(out).not.toContain(secret);
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(parsed).toEqual({
      severity: 'ERROR',
      event: 'x',
      route: '[redacted]',
      jobId: '[redacted]',
      code: '[redacted]',
      status: 503,
    });
  });

  it('logs errors by name and Native code, never message', () => {
    logEvent(
      'ERROR',
      { event: 'e' },
      new Error('x a@b.co https://h/p?token=1'),
    );
    logEvent('WARNING', { event: 'e' }, new NativeMediaError('MISMATCH'));
    expect(lines.join('\n')).not.toMatch(/a@b\.co|https:/u);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ errorName: 'Error' });
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({
      errorName: 'NativeMediaError',
      code: 'MISMATCH',
    });
  });

  it('accepts only well-formed request ids', () => {
    expect(requestIdFrom('abc-123')).toBe('abc-123');
    expect(requestIdFrom('bad id\n')).not.toBe('bad id\n');
    expect(requestIdFrom(null)).toMatch(/^[0-9a-f-]{36}$/u);
    setLogSink(previous);
  });
});
