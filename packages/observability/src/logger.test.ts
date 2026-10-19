import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { resolveCorrelationId } from './correlation.js';
import { createLogger, urlForLog } from './logger.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { lines, stream };
}

describe('logger redaction', () => {
  it('redacts credentials and private content at nested levels', () => {
    const { lines, stream } = capture();
    const logger = createLogger(
      { service: 'test', environment: 'test' },
      stream,
    );
    logger.info(
      {
        authorization: 'Bearer top-level',
        headers: { cookie: 'sb=session', authorization: 'Bearer nested' },
        job: {
          payload: { token: 'deep-token', signedUrl: 'https://s3/x?sig' },
        },
        post: { content: 'private words', id: 'p1' },
      },
      'event',
    );
    const output = lines.join('');
    for (const secret of [
      'top-level',
      'sb=session',
      'nested',
      'deep-token',
      'https://s3/x?sig',
      'private words',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('"id":"p1"');
    expect(output).toContain('"service":"test"');
  });
});

describe('urlForLog', () => {
  it('drops query strings and fragments', () => {
    expect(urlForLog('/media/x?X-Amz-Signature=abc')).toBe('/media/x');
    expect(urlForLog('/auth/callback#access_token=abc')).toBe('/auth/callback');
    expect(urlForLog('/health')).toBe('/health');
  });
});

describe('resolveCorrelationId', () => {
  it('keeps safe IDs and replaces unsafe ones', () => {
    expect(resolveCorrelationId('req-123.abc')).toBe('req-123.abc');
    expect(resolveCorrelationId('bad id\n')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
