import { type ActionOutcome } from '@/lib/actions/action-result';
import { type MediaAssetView } from '@paldora/validation';
export const MEDIA_POLL_MS = 1_500;
export const MEDIA_MAX_POLLS = 40;

type AssetStatus = MediaAssetView['status'];
type StatusCheck = (
  mediaAssetId: string,
) => Promise<ActionOutcome<AssetStatus>>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface PollOptions {
  readonly pollMs?: number;
  readonly maxPolls?: number;
  readonly wait?: (ms: number) => Promise<void>;
}

/**
 * Polls an upload's status until the worker finishes (`ready`), gives up
 * (`failed`, `deleted`, an error), or the wait runs out (`processing`: the
 * asset may still become ready, so the caller decides what to say).
 */
export async function untilSettled(
  mediaAssetId: string,
  check: StatusCheck,
  {
    pollMs = MEDIA_POLL_MS,
    maxPolls = MEDIA_MAX_POLLS,
    wait = sleep,
  }: PollOptions = {},
): Promise<'ready' | 'failed' | 'processing'> {
  for (let poll = 0; poll < maxPolls; poll += 1) {
    // One poll at a time by design: each waits for the previous answer.
    // eslint-disable-next-line no-await-in-loop
    await wait(pollMs);
    // eslint-disable-next-line no-await-in-loop
    const result = await check(mediaAssetId);
    if (result.status === 'error') return 'failed';
    if (result.data === 'ready') return 'ready';
    if (result.data === 'failed' || result.data === 'deleted') return 'failed';
  }
  return 'processing';
}

/** Like `untilSettled`, but running out of time also counts as `failed`. */
export async function untilProcessed(
  mediaAssetId: string,
  check: StatusCheck,
  options: PollOptions = {},
): Promise<'ready' | 'failed'> {
  const outcome = await untilSettled(mediaAssetId, check, options);
  return outcome === 'ready' ? 'ready' : 'failed';
}
