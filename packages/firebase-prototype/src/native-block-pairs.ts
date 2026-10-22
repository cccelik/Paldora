import type { Firestore } from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

/**
 * Trusted block-pair protocol for invitation invalidation. Every block must
 * advance epoch; an unblock never restores invitations from an older epoch.
 * A future callable wrapper must bind actorUid to verified Firebase Auth.
 */
export class NativeBlockPairs {
  public constructor(private readonly db: Firestore) {}

  public async setBlocked(
    actorUid: string,
    targetUid: string,
    value: boolean,
  ): Promise<void> {
    if (actorUid === targetUid) throw new Error('Cannot block yourself.');
    const pairRef = this.db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(actorUid, targetUid));
    const actorRef = this.db.collection('nativeAccounts').doc(actorUid);
    await this.db.runTransaction(async (tx) => {
      const [actor, pair] = await Promise.all([
        tx.get(actorRef),
        tx.get(pairRef),
      ]);
      if (!actor.exists || actor.get('status') !== 'active')
        throw new Error('Account unavailable.');
      const blockedBy = (pair.exists ? pair.get('blockedBy') : []) as string[];
      const wasBlocked = blockedBy.includes(actorUid);
      if (wasBlocked === value) return;
      const next = value
        ? [...blockedBy, actorUid].sort()
        : blockedBy.filter((uid) => uid !== actorUid);
      const epoch =
        (pair.exists ? ((pair.get('epoch') as number | undefined) ?? 0) : 0) +
        (value ? 1 : 0);
      tx.set(pairRef, { blockedBy: next, epoch });
    });
  }
}
