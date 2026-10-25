import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export class NativeRateLimitError extends Error {
  public constructor() {
    super('RATE_LIMITED');
  }
}

/** Per-account, per-action fixed windows. Firestore errors fail the call closed. */
export class NativeRateLimits {
  public constructor(private readonly db: Firestore) {}

  public async consume(
    uid: string,
    scope: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): Promise<void> {
    if (
      !uid ||
      !scope ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      !Number.isSafeInteger(windowMs) ||
      windowMs < 1
    )
      throw new Error('Invalid rate limit configuration.');
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = createHash('sha256')
      .update(JSON.stringify([uid, scope, windowStart]))
      .digest('hex');
    const ref = this.db.collection('nativeRateBuckets').doc(key);
    await this.db.runTransaction(async (tx) => {
      const bucket = await tx.get(ref);
      const count = bucket.exists ? (bucket.get('count') as number) : 0;
      if (count >= limit) throw new NativeRateLimitError();
      tx.set(ref, {
        uid,
        scope,
        windowStart,
        count: count + 1,
        expiresAt: windowStart + windowMs,
      });
    });
  }
}
