import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export class NativeAccountError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'ALREADY_RESTRICTED',
  ) {
    super(code);
  }
}

/**
 * Trusted account state for local migration tests. Only operator-controlled or
 * Auth-verified trusted code may call these methods. Client rules never allow
 * account creation or status changes.
 */
export class NativeAccounts {
  public constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
  ) {}

  public async provision(uid: string, now = Date.now()): Promise<void> {
    const user = await this.auth.getUser(uid).catch(() => {
      throw new NativeAccountError('UNAVAILABLE');
    });
    if (user.disabled || !user.emailVerified)
      throw new NativeAccountError('UNAVAILABLE');
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(accountRef);
      if (existing.exists) {
        if (existing.get('status') === 'active') return;
        throw new NativeAccountError('ALREADY_RESTRICTED');
      }
      tx.create(accountRef, { status: 'active', createdAt: now });
    });
  }

  public async suspend(uid: string): Promise<void> {
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const account = await tx.get(accountRef);
      if (!account.exists) throw new NativeAccountError('UNAVAILABLE');
      if (account.get('status') !== 'suspended')
        tx.update(accountRef, { status: 'suspended' });
    });
    // Firestore rules deny reads as soon as the status write commits. Token
    // revocation blocks future refreshes and is safe to retry after failure.
    await this.auth.revokeRefreshTokens(uid);
  }
}
