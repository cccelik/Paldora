import { setLogSink } from '@paldora/firebase-trusted';
import { describe, expect, it } from 'vitest';
import { observedJob } from './observed.js';

describe('observedJob', () => {
  it('rethrows and logs one line without message content', async () => {
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    const run = observedJob('job', () =>
      Promise.reject(new Error('a@b.co https://h/p?token=1')),
    );
    await expect(run()).rejects.toThrow('a@b.co');
    setLogSink(previous);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/a@b\.co|https:/u);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      severity: 'ERROR',
      event: 'job.failed',
      errorName: 'Error',
    });
  });
});
