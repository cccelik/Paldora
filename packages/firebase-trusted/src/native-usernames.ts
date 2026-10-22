import {
  isReservedUsername,
  normalizeUsername,
  usernameSchema,
} from '@paldora/validation';
import type { Firestore } from 'firebase-admin/firestore';

export class NativeUsernameError extends Error {
  public constructor(public readonly code: 'UNAVAILABLE' | 'TAKEN') {
    super(code);
  }
}

/** Trusted reservation protocol; caller UID must come from verified Auth. */
export class NativeUsernames {
  public constructor(private readonly db: Firestore) {}

  public async reserve(uid: string, username: string): Promise<string> {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success || isReservedUsername(username))
      throw new NativeUsernameError('UNAVAILABLE');
    const normalized = normalizeUsername(parsed.data);
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    const nextRef = this.db.collection('nativeUsernames').doc(normalized);
    await this.db.runTransaction(async (tx) => {
      const account = await tx.get(accountRef);
      if (!account.exists || account.get('status') !== 'active')
        throw new NativeUsernameError('UNAVAILABLE');
      const previous = account.get('usernameNormalized') as string | undefined;
      const previousRef =
        previous && previous !== normalized
          ? this.db.collection('nativeUsernames').doc(previous)
          : null;
      const [next, old] = await Promise.all([
        tx.get(nextRef),
        previousRef ? tx.get(previousRef) : Promise.resolve(null),
      ]);
      if (next.exists && next.get('uid') !== uid)
        throw new NativeUsernameError('TAKEN');
      if (old && old.exists && old.get('uid') !== uid)
        throw new NativeUsernameError('UNAVAILABLE');
      if (previousRef && old?.exists) tx.delete(previousRef);
      tx.set(nextRef, { uid });
      tx.update(accountRef, {
        username: parsed.data,
        usernameNormalized: normalized,
      });
    });
    return normalized;
  }
}
