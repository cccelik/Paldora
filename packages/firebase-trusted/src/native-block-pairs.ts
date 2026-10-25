import { normalizeUsername, usernameSchema } from '@paldora/validation';
import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeBlockError extends Error {
  public constructor(public readonly code: 'INVALID' | 'UNAVAILABLE') {
    super(code);
  }
}

function assertBlockParticipants(
  actor: DocumentSnapshot,
  target: DocumentSnapshot,
  mapping: DocumentSnapshot | null,
  targetUid: string,
  value: boolean,
): void {
  if (
    !actor.exists ||
    actor.get('status') !== 'active' ||
    (value && target.get('status') !== 'active') ||
    (mapping && mapping.get('uid') !== targetUid)
  )
    throw new NativeBlockError('UNAVAILABLE');
}

/** Every block advances the pair epoch; unblock never restores old invitations. */
export class NativeBlockPairs {
  public constructor(private readonly db: Firestore) {}

  public async blockByUsername(
    actorUid: string,
    username: string,
    now = Date.now(),
  ): Promise<string> {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) throw new NativeBlockError('UNAVAILABLE');
    const normalized = normalizeUsername(parsed.data);
    const mapping = await this.db
      .collection('nativeUsernames')
      .doc(normalized)
      .get();
    const targetUid = mapping.get('uid') as string | undefined;
    if (!targetUid) throw new NativeBlockError('UNAVAILABLE');
    await this.setBlocked(actorUid, targetUid, true, now, normalized);
    return targetUid;
  }

  public async list(
    actorUid: string,
    cursor?: string,
    limit = 20,
  ): Promise<{
    items: Array<{
      userId: string;
      username: string;
      displayName: string;
      blockedAt: number;
    }>;
    nextCursor: string | null;
  }> {
    const actorRef = this.db.collection('nativeAccounts').doc(actorUid);
    if ((await actorRef.get()).get('status') !== 'active')
      throw new NativeBlockError('UNAVAILABLE');
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query = this.db
      .collection('nativeBlockPairs')
      .where('blockedBy', 'array-contains', actorUid)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) {
      const marker = await this.db
        .collection('nativeBlockPairs')
        .doc(cursor)
        .get();
      if (
        !marker.exists ||
        !(marker.get('blockedBy') as string[] | undefined)?.includes(actorUid)
      )
        throw new NativeBlockError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const pair = await tx.get(candidate.ref);
          const users = pair.get('users') as string[] | undefined;
          const otherUid = users?.find((uid) => uid !== actorUid);
          if (
            !otherUid ||
            !(pair.get('blockedBy') as string[] | undefined)?.includes(actorUid)
          )
            return null;
          const [actor, account, profile] = await Promise.all([
            tx.get(actorRef),
            tx.get(this.db.collection('nativeAccounts').doc(otherUid)),
            tx.get(this.db.collection('nativeProfiles').doc(otherUid)),
          ]);
          if (actor.get('status') !== 'active' || !account.exists) return null;
          const username = account.get('username') as string | undefined;
          const blockedAt = (
            pair.get('blockedAtBy') as Record<string, number> | undefined
          )?.[actorUid];
          if (!username || typeof blockedAt !== 'number') return null;
          return {
            userId: otherUid,
            username,
            displayName:
              (profile.get('displayName') as string | null) || username,
            blockedAt,
          };
        }),
      ),
    );
    return {
      items: items.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
      nextCursor:
        page.size === pageSize ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async setBlocked(
    actorUid: string,
    targetUid: string,
    value: boolean,
    now = Date.now(),
    normalizedUsername?: string,
  ): Promise<void> {
    if (actorUid === targetUid) throw new NativeBlockError('INVALID');
    const pairId = nativeBlockPairId(actorUid, targetUid);
    const pairRef = this.db.collection('nativeBlockPairs').doc(pairId);
    const friendRef = this.db.collection('nativeFriendPairs').doc(pairId);
    const actorRef = this.db.collection('nativeAccounts').doc(actorUid);
    await this.db.runTransaction(async (tx) => {
      const [actor, target, pair, friendship, mapping] = await Promise.all([
        tx.get(actorRef),
        tx.get(this.db.collection('nativeAccounts').doc(targetUid)),
        tx.get(pairRef),
        tx.get(friendRef),
        normalizedUsername
          ? tx.get(
              this.db.collection('nativeUsernames').doc(normalizedUsername),
            )
          : Promise.resolve(null),
      ]);
      assertBlockParticipants(actor, target, mapping, targetUid, value);
      const blockedBy = (pair.exists ? pair.get('blockedBy') : []) as string[];
      const wasBlocked = blockedBy.includes(actorUid);
      if (wasBlocked === value) return;
      const next = value
        ? [...blockedBy, actorUid].sort()
        : blockedBy.filter((uid) => uid !== actorUid);
      const epoch =
        (pair.exists ? ((pair.get('epoch') as number | undefined) ?? 0) : 0) +
        (value ? 1 : 0);
      const blockedAtBy = {
        ...((pair.get('blockedAtBy') as Record<string, number> | undefined) ??
          {}),
      };
      if (value) blockedAtBy[actorUid] = now;
      else delete blockedAtBy[actorUid];
      tx.set(pairRef, {
        users: [actorUid, targetUid].sort(),
        blockedBy: next,
        blockedAtBy,
        epoch,
      });
      if (
        value &&
        friendship.exists &&
        ['pending', 'accepted'].includes(friendship.get('status') as string)
      )
        tx.update(friendRef, { status: 'blocked', updatedAt: now });
    });
  }
}
