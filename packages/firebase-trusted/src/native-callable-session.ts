import type { Firestore } from 'firebase-admin/firestore';

/** Epoch lookups are cached briefly so a burst of calls costs one read. */
const EPOCH_TTL_MS = 10_000;
const EPOCH_CACHE_MAX = 5_000;

export class NativeCallableSessionError extends Error {
  public constructor() {
    super('SESSION_REVOKED');
  }
}

interface CachedEpoch {
  value: string | undefined;
  expiresAt: number;
}

/**
 * Rejects a callable's ID token once the account's session epoch has moved on
 * (password change, sign-out everywhere). The token's `paldoraSessionEpoch`
 * claim must equal `nativeAccounts/{uid}.sessionEpoch`; both absent counts as
 * equal for accounts that never rotated. Fails closed when the read fails.
 * A rotation is seen within `EPOCH_TTL_MS` on an instance that cached the
 * old value, so the revocation window is seconds, not the token's hour.
 */
export class NativeCallableSessions {
  private readonly cache = new Map<string, CachedEpoch>();

  public constructor(
    private readonly db: Firestore,
    private readonly now: () => number = Date.now,
  ) {}

  public async require(uid: string, tokenEpoch: unknown): Promise<void> {
    const claim = typeof tokenEpoch === 'string' ? tokenEpoch : undefined;
    if ((await this.currentEpoch(uid)) !== claim)
      throw new NativeCallableSessionError();
  }

  private async currentEpoch(uid: string): Promise<string | undefined> {
    const now = this.now();
    const hit = this.cache.get(uid);
    if (hit && hit.expiresAt > now) return hit.value;
    const account = await this.db
      .collection('nativeAccounts')
      .doc(uid)
      .get()
      .catch(() => {
        throw new NativeCallableSessionError();
      });
    const raw = account.get('sessionEpoch');
    const value = typeof raw === 'string' ? raw : undefined;
    if (this.cache.size >= EPOCH_CACHE_MAX) this.cache.clear();
    this.cache.set(uid, { value, expiresAt: now + EPOCH_TTL_MS });
    return value;
  }
}
