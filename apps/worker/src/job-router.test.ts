import { createLogger } from '@paldora/observability';
import { UnrecoverableError, type Job } from 'bullmq';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createJobRouter } from './job-router.js';

const lines: string[] = [];
const logger = createLogger(
  { service: 'worker', environment: 'test' },
  new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  }),
);
const job = (name: string) => ({ id: 'job-1', name, data: {} }) as Job;

describe('job router', () => {
  it('dispatches to the named handler with a correlated logger', async () => {
    lines.length = 0;
    const handler = vi.fn(
      async (_job: Job, context: { logger: typeof logger }) => {
        context.logger.info('handled');
      },
    );
    await createJobRouter({ 'test.job': handler }, { logger })(job('test.job'));
    expect(handler).toHaveBeenCalledOnce();
    expect(lines.join('')).toMatch(
      /"jobId":"job-1".*"jobName":"test.job".*handled/,
    );
  });

  it('treats unknown job names as unrecoverable', async () => {
    await expect(
      createJobRouter({}, { logger })(job('unknown.job')),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
