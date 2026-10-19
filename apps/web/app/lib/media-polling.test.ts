import type { MediaAssetView } from '@paldora/validation';
import { describe, expect, it, vi } from 'vitest';
import type { ActionOutcome } from './action-result';
import { MEDIA_POLL_MS, untilProcessed } from './media-polling';

type Status = MediaAssetView['status'];
const ok = (data: Status): ActionOutcome<Status> => ({
  status: 'success',
  message: data,
  data,
});
const sequence = (...answers: ActionOutcome<Status>[]) => {
  const check = vi.fn<(id: string) => Promise<ActionOutcome<Status>>>();
  for (const answer of answers) check.mockResolvedValueOnce(answer);
  return check;
};
const instant = { wait: () => Promise.resolve() };

describe('untilProcessed', () => {
  it('waits through processing until the asset is ready', async () => {
    const check = sequence(ok('processing'), ok('processing'), ok('ready'));
    await expect(untilProcessed('id', check, instant)).resolves.toBe('ready');
    expect(check).toHaveBeenCalledTimes(3);
    expect(check).toHaveBeenCalledWith('id');
  });

  it('fails on a failed or deleted asset, or an error', async () => {
    await expect(
      untilProcessed('id', sequence(ok('failed')), instant),
    ).resolves.toBe('failed');
    await expect(
      untilProcessed('id', sequence(ok('deleted')), instant),
    ).resolves.toBe('failed');
    const error: ActionOutcome<Status> = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'x',
      tone: 'failure',
    };
    await expect(untilProcessed('id', sequence(error), instant)).resolves.toBe(
      'failed',
    );
  });

  it('gives up after the last poll', async () => {
    const check = vi.fn(() => Promise.resolve(ok('processing')));
    await expect(
      untilProcessed('id', check, { ...instant, maxPolls: 3 }),
    ).resolves.toBe('failed');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('waits the poll interval before each check', async () => {
    const wait = vi.fn(() => Promise.resolve());
    await untilProcessed('id', sequence(ok('ready')), { wait });
    expect(wait).toHaveBeenCalledWith(MEDIA_POLL_MS);
  });
});
