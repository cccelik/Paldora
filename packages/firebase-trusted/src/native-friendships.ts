import { normalizeUsername, usernameSchema } from '@paldora/validation';
import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeFriendshipError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'ALREADY_EXISTS',
  ) {
    super(code);
  }
}

export interface NativeFriendship {
  id: string;
  otherUid: string;
  status: 'pending' | 'sent' | 'accepted';
  requesterUid: string;
  createdAt: number;
  updatedAt: number;
  username: string;
  displayName: string;
}

type Listing = 'pending' | 'sent' | 'accepted' | 'requests';

function matchesListing(
  pair: DocumentSnapshot,
  uid: string,
  status: Listing,
  storedStatus: 'pending' | 'accepted',
): boolean {
  return Boolean(
    pair.exists &&
    pair.get('status') === storedStatus &&
    (pair.get('users') as string[] | undefined)?.includes(uid) &&
    (status !== 'pending' || pair.get('recipientUid') === uid) &&
    (status !== 'sent' || pair.get('requesterUid') === uid),
  );
}

function listingStatus(
  pair: DocumentSnapshot,
  uid: string,
  status: Listing,
): NativeFriendship['status'] {
  if (status !== 'requests') return status;
  return pair.get('requesterUid') === uid ? 'sent' : 'pending';
}

export class NativeFriendships {
  public constructor(private readonly db: Firestore) {}

  public async sendByUsername(
    requesterUid: string,
    username: string,
    now = Date.now(),
  ): Promise<string> {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) throw new NativeFriendshipError('UNAVAILABLE');
    const normalized = normalizeUsername(parsed.data);
    const mappingRef = this.db.collection('nativeUsernames').doc(normalized);
    const initial = await mappingRef.get();
    const recipientUid = initial.get('uid') as string | undefined;
    if (!recipientUid || recipientUid === requesterUid)
      throw new NativeFriendshipError('UNAVAILABLE');
    const id = nativeBlockPairId(requesterUid, recipientUid);
    const pairRef = this.db.collection('nativeFriendPairs').doc(id);
    const blockRef = this.db.collection('nativeBlockPairs').doc(id);
    await this.db.runTransaction(async (tx) => {
      const [mapping, requester, recipient, block, pair] = await Promise.all([
        tx.get(mappingRef),
        tx.get(this.db.collection('nativeAccounts').doc(requesterUid)),
        tx.get(this.db.collection('nativeAccounts').doc(recipientUid)),
        tx.get(blockRef),
        tx.get(pairRef),
      ]);
      if (
        mapping.get('uid') !== recipientUid ||
        requester.get('status') !== 'active' ||
        recipient.get('status') !== 'active' ||
        (block.exists &&
          (block.get('blockedBy') as string[] | undefined)?.length)
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      if (
        pair.exists &&
        ['pending', 'accepted'].includes(pair.get('status') as string)
      )
        throw new NativeFriendshipError('ALREADY_EXISTS');
      tx.set(pairRef, {
        users: [requesterUid, recipientUid].sort(),
        requesterUid,
        recipientUid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        blockEpoch: block.exists ? (block.get('epoch') as number) : 0,
      });
    });
    return id;
  }

  public async accept(
    id: string,
    recipientUid: string,
    now = Date.now(),
  ): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('nativeFriendPairs').doc(id);
      const pair = await tx.get(ref);
      if (
        !pair.exists ||
        pair.get('status') !== 'pending' ||
        pair.get('recipientUid') !== recipientUid
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      const requesterUid = pair.get('requesterUid') as string;
      const [requester, recipient, block] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(requesterUid)),
        tx.get(this.db.collection('nativeAccounts').doc(recipientUid)),
        tx.get(this.db.collection('nativeBlockPairs').doc(id)),
      ]);
      if (
        requester.get('status') !== 'active' ||
        recipient.get('status') !== 'active' ||
        (block.exists &&
          (block.get('blockedBy') as string[] | undefined)?.length) ||
        pair.get('blockEpoch') !==
          (block.exists ? (block.get('epoch') as number) : 0)
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      tx.update(ref, { status: 'accepted', updatedAt: now });
    });
  }

  public async close(
    id: string,
    actorUid: string,
    now = Date.now(),
  ): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('nativeFriendPairs').doc(id);
      const [actor, pair] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(actorUid)),
        tx.get(ref),
      ]);
      if (
        actor.get('status') !== 'active' ||
        !pair.exists ||
        !(pair.get('users') as string[] | undefined)?.includes(actorUid) ||
        !['pending', 'accepted'].includes(pair.get('status') as string)
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      const status = pair.get('status') as string;
      tx.update(ref, {
        status: status === 'pending' ? 'declined' : 'removed',
        updatedAt: now,
      });
    });
  }

  /** Only the recipient can decline a still-pending request. */
  public async decline(
    id: string,
    recipientUid: string,
    now = Date.now(),
  ): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('nativeFriendPairs').doc(id);
      const [pair, account] = await Promise.all([
        tx.get(ref),
        tx.get(this.db.collection('nativeAccounts').doc(recipientUid)),
      ]);
      if (
        account.get('status') !== 'active' ||
        !pair.exists ||
        pair.get('status') !== 'pending' ||
        pair.get('recipientUid') !== recipientUid
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      tx.update(ref, { status: 'declined', updatedAt: now });
    });
  }

  /** Only the sender can withdraw a still-pending request. */
  public async cancel(id: string, requesterUid: string): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('nativeFriendPairs').doc(id);
      const [pair, account] = await Promise.all([
        tx.get(ref),
        tx.get(this.db.collection('nativeAccounts').doc(requesterUid)),
      ]);
      if (
        account.get('status') !== 'active' ||
        !pair.exists ||
        pair.get('status') !== 'pending' ||
        pair.get('requesterUid') !== requesterUid
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      tx.delete(ref);
    });
  }

  /** Removal accepts the other person's UID, matching the web contract. */
  public async remove(actorUid: string, otherUid: string): Promise<void> {
    if (actorUid === otherUid) throw new NativeFriendshipError('UNAVAILABLE');
    const ref = this.db
      .collection('nativeFriendPairs')
      .doc(nativeBlockPairId(actorUid, otherUid));
    await this.db.runTransaction(async (tx) => {
      const [pair, account] = await Promise.all([
        tx.get(ref),
        tx.get(this.db.collection('nativeAccounts').doc(actorUid)),
      ]);
      if (
        account.get('status') !== 'active' ||
        !pair.exists ||
        pair.get('status') !== 'accepted' ||
        !(pair.get('users') as string[] | undefined)?.includes(actorUid) ||
        !(pair.get('users') as string[] | undefined)?.includes(otherUid)
      )
        throw new NativeFriendshipError('UNAVAILABLE');
      tx.delete(ref);
    });
  }

  public async list(
    uid: string,
    status: Listing,
    cursor?: string,
    limit = 20,
  ): Promise<{
    items: NativeFriendship[];
    nextCursor: string | null;
  }> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeFriendshipError('FORBIDDEN');
    const storedStatus =
      status === 'sent' || status === 'requests' ? 'pending' : status;
    let query =
      status === 'pending'
        ? this.db
            .collection('nativeFriendPairs')
            .where('recipientUid', '==', uid)
            .where('status', '==', 'pending')
        : status === 'sent'
          ? this.db
              .collection('nativeFriendPairs')
              .where('requesterUid', '==', uid)
              .where('status', '==', 'pending')
          : this.db
              .collection('nativeFriendPairs')
              .where('users', 'array-contains', uid)
              .where('status', '==', storedStatus);
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    query = query
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(pageSize);
    if (cursor) {
      const cursorDoc = await this.db
        .collection('nativeFriendPairs')
        .doc(cursor)
        .get();
      if (!matchesListing(cursorDoc, uid, status, storedStatus))
        throw new NativeFriendshipError('UNAVAILABLE');
      query = query.startAfter(cursorDoc);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const pair = await tx.get(candidate.ref);
          if (!matchesListing(pair, uid, status, storedStatus)) return null;
          const otherUid = (pair.get('users') as string[]).find(
            (item) => item !== uid,
          );
          if (!otherUid) return null;
          const [self, other, profile, block] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(uid)),
            tx.get(this.db.collection('nativeAccounts').doc(otherUid)),
            tx.get(this.db.collection('nativeProfiles').doc(otherUid)),
            tx.get(this.db.collection('nativeBlockPairs').doc(candidate.id)),
          ]);
          if (
            self.get('status') !== 'active' ||
            other.get('status') !== 'active' ||
            (block.exists &&
              (block.get('blockedBy') as string[] | undefined)?.length)
          )
            return null;
          const username = other.get('username') as string | undefined;
          if (!username) return null;
          return {
            id: candidate.id,
            otherUid,
            status: listingStatus(pair, uid, status),
            requesterUid: pair.get('requesterUid') as string,
            createdAt: pair.get('createdAt') as number,
            updatedAt: pair.get('updatedAt') as number,
            username,
            displayName:
              (profile.get('displayName') as string | null) || username,
          };
        }),
      ),
    );
    return {
      items: items.filter((item): item is NativeFriendship => item !== null),
      nextCursor:
        page.size === pageSize ? page.docs[page.docs.length - 1]!.id : null,
    };
  }
}
