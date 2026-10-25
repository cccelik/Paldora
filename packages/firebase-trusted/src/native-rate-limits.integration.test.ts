import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import {
  NativeRateLimitError,
  NativeRateLimits,
} from './native-rate-limits.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `rates-${randomUUID()}`,
);
const limits = new NativeRateLimits(getFirestore(app));
afterAll(() => deleteApp(app));

describe('trusted Firebase rate limits', () => {
  it('serializes concurrent calls and resets at the next window', async () => {
    const uid = randomUUID();
    const attempts = await Promise.allSettled([
      limits.consume(uid, 'invite', 1, 1_000, 1_000),
      limits.consume(uid, 'invite', 1, 1_000, 1_000),
    ]);
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: expect.any(NativeRateLimitError),
    });
    await expect(
      limits.consume(uid, 'other', 1, 1_000, 1_000),
    ).resolves.toBeUndefined();
    await expect(
      limits.consume(uid, 'invite', 1, 1_000, 2_000),
    ).resolves.toBeUndefined();
  }, 20_000);
});
