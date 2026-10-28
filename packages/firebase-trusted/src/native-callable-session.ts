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
  /** False once the account document says anything but `active`. */
  usable: boolean;
  expiresAt: number;
}

/**
 * Rejects a callable's ID token once the account's session epoch has moved on
 * (password change, sign-out everywhere). The token's `paldoraSessionEpoch`
 * claim must equal `nativeAccounts/{uid}.sessionEpoch`; both absent counts as
 * equal for accounts that never rotated. Fails closed when the read fails.
 * A rotation is seen within `EPOCH_TTL_MS` on an instance that cached the
 * old value, so the revocation window is seconds, not the token's hour.
 * The same already-read document carries `status`: a suspended (or any other
 * non-`active`) account is refused with the same error, at no extra read. An
 * account document that does not exist yet is not refused here; services
 * still require an active account.
 */
export class NativeCallableSessions {
  private readonly cache = new Map<string, CachedEpoch>();

  public constructor(
    private readonly db: Firestore,
    private readonly now: () => number = Date.now,
  ) {}

  public async require(uid: string, tokenEpoch: unknown): Promise<void> {
    const claim = typeof tokenEpoch === 'string' ? tokenEpoch : undefined;
    const current = await this.currentEpoch(uid);
    if (!current.usable || current.value !== claim)
      throw new NativeCallableSessionError();
  }

  /** Drop a cached epoch after this instance rotated it, so it is refused at once. */
  public forget(uid: string): void {
    this.cache.delete(uid);
  }

  private async currentEpoch(uid: string): Promise<CachedEpoch> {
    const now = this.now();
    const hit = this.cache.get(uid);
    if (hit && hit.expiresAt > now) return hit;
    const account = await this.db
      .collection('nativeAccounts')
      .doc(uid)
      .get()
      .catch(() => {
        throw new NativeCallableSessionError();
      });
    const raw = account.get('sessionEpoch');
    const value = typeof raw === 'string' ? raw : undefined;
    const status = account.get('status');
    const entry: CachedEpoch = {
      value,
      usable: !account.exists || status === 'active',
      expiresAt: now + EPOCH_TTL_MS,
    };
    if (this.cache.size >= EPOCH_CACHE_MAX) this.cache.clear();
    this.cache.set(uid, entry);
    return entry;
  }
}
