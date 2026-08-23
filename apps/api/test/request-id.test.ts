import { describe, expect, it } from 'vitest';
import { resolveRequestId } from '../src/request-id.js';

describe('resolveRequestId', () => {
  it('preserves bounded trace ids and replaces unsafe values', () => {
    expect(resolveRequestId('trace_123.example')).toBe('trace_123.example');
    expect(resolveRequestId('x'.repeat(129))).toMatch(/^[0-9a-f-]{36}$/u);
    expect(resolveRequestId('line\nbreak')).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
