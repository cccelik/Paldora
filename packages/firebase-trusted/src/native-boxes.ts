import { randomUUID } from 'node:crypto';
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

export class NativeBoxError extends Error {
  public constructor(public readonly code: 'UNAVAILABLE' | 'INVALID') {
    super(code);
  }
}

export interface TrustedBox {
  id: string;
  name: string;
  ownerUid: string;
  status: 'active' | 'archived';
  version: number;
  currentUserRole: 'owner' | 'admin' | 'member';
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

function active(snapshot: DocumentSnapshot): boolean {
  return snapshot.exists && snapshot.get('status') === 'active';
}

function readableBox(box: DocumentSnapshot): boolean {
  return (
    box.exists &&
    (box.get('status') === 'active' || box.get('status') === 'archived')
  );
}

function toBox(
  box: DocumentSnapshot,
  role: TrustedBox['currentUserRole'],
): TrustedBox {
  return {
    id: box.id,
    name: box.get('name') as string,
    ownerUid: box.get('ownerUid') as string,
    status: box.get('status') as TrustedBox['status'],
    version: box.get('version') as number,
    currentUserRole: role,
    memberCount: (box.get('memberCount') as number | undefined) ?? 1,
    createdAt: (box.get('createdAt') as number | undefined) ?? 0,
    updatedAt: (box.get('updatedAt') as number | undefined) ?? 0,
  };
}

/** Trusted Box lifecycle used by server-only web access. */
export class NativeBoxes {
  public constructor(private readonly db: Firestore) {}

  private box(boxId: string) {
    return this.db.collection('nativeBoxes').doc(boxId);
  }

  public async create(
    uid: string,
    name: string,
    boxId = randomUUID(),
    now = Date.now(),
  ): Promise<TrustedBox> {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80)
      throw new NativeBoxError('INVALID');
    const boxRef = this.box(boxId);
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const [account, deletion] = await Promise.all([
        tx.get(accountRef),
        tx.get(this.db.collection('nativeDeletionRequests').doc(uid)),
      ]);
      if (
        !active(account) ||
        (deletion.exists &&
          ['pending', 'blocked', 'running'].includes(
            deletion.get('status') as string,
          ))
      )
        throw new NativeBoxError('UNAVAILABLE');
      tx.create(boxRef, {
        id: boxId,
        name: cleanName,
        ownerUid: uid,
        status: 'active',
        version: 1,
        memberCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(boxRef.collection('members').doc(uid), {
        uid,
        role: 'owner',
        status: 'active',
        joinedAt: now,
      });
      tx.create(accountRef.collection('boxRefs').doc(boxId), { boxId });
    });
    return {
      id: boxId,
      name: cleanName,
      ownerUid: uid,
      status: 'active',
      version: 1,
      currentUserRole: 'owner',
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async get(boxId: string, uid: string): Promise<TrustedBox> {
    return this.db.runTransaction(async (tx) => {
      const boxRef = this.box(boxId);
      const [box, account, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(boxRef.collection('members').doc(uid)),
      ]);
      if (!readableBox(box) || !active(account) || !active(member))
        throw new NativeBoxError('UNAVAILABLE');
      const role = member.get('role') as TrustedBox['currentUserRole'];
      if (!['owner', 'admin', 'member'].includes(role))
        throw new NativeBoxError('UNAVAILABLE');
      return toBox(box, role);
    });
  }

  public async list(
    uid: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: TrustedBox[]; nextCursor: string | null }> {
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    if (!active(await accountRef.get()))
      throw new NativeBoxError('UNAVAILABLE');
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query = accountRef
      .collection('boxRefs')
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) {
      const marker = await accountRef.collection('boxRefs').doc(cursor).get();
      if (!marker.exists) throw new NativeBoxError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map(async (hint) => {
        try {
          return await this.get(hint.id, uid);
        } catch (error) {
          if (error instanceof NativeBoxError) return null;
          throw error;
        }
      }),
    );
    return {
      items: items.filter((item): item is TrustedBox => item !== null),
      nextCursor:
        page.size === pageSize ? page.docs[page.docs.length - 1]!.id : null,
    };
  }

  public async update(
    boxId: string,
    uid: string,
    changes: { name?: string; status?: 'active' | 'archived' },
  ): Promise<TrustedBox> {
    if (changes.name === undefined && changes.status === undefined)
      throw new NativeBoxError('INVALID');
    const name = changes.name?.trim();
    if (name !== undefined && (!name || name.length > 80))
      throw new NativeBoxError('INVALID');
    const ref = this.box(boxId);
    await this.db.runTransaction(async (tx) => {
      const [box, owner, account] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection('members').doc(uid)),
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
      ]);
      if (
        !readableBox(box) ||
        !active(account) ||
        !active(owner) ||
        owner.get('role') !== 'owner' ||
        box.get('ownerUid') !== uid
      )
        throw new NativeBoxError('UNAVAILABLE');
      tx.update(ref, {
        ...(name === undefined ? {} : { name }),
        ...(changes.status === undefined ? {} : { status: changes.status }),
        version: (box.get('version') as number) + 1,
        updatedAt: Date.now(),
      });
    });
    return this.get(boxId, uid);
  }

  public async transfer(
    boxId: string,
    ownerUid: string,
    nextOwnerUid: string,
  ): Promise<void> {
    if (ownerUid === nextOwnerUid) throw new NativeBoxError('INVALID');
    const ref = this.box(boxId);
    await this.db.runTransaction(async (tx) => {
      const ownerRef = ref.collection('members').doc(ownerUid);
      const nextRef = ref.collection('members').doc(nextOwnerUid);
      const [box, owner, next, ownerAccount, nextAccount, nextDeletion] =
        await Promise.all([
          tx.get(ref),
          tx.get(ownerRef),
          tx.get(nextRef),
          tx.get(this.db.collection('nativeAccounts').doc(ownerUid)),
          tx.get(this.db.collection('nativeAccounts').doc(nextOwnerUid)),
          tx.get(
            this.db.collection('nativeDeletionRequests').doc(nextOwnerUid),
          ),
        ]);
      if (
        box.get('status') !== 'active' ||
        box.get('ownerUid') !== ownerUid ||
        !active(ownerAccount) ||
        !active(nextAccount) ||
        (nextDeletion.exists &&
          ['pending', 'blocked', 'running'].includes(
            nextDeletion.get('status') as string,
          )) ||
        !active(owner) ||
        !active(next) ||
        owner.get('role') !== 'owner' ||
        next.get('role') === 'owner'
      )
        throw new NativeBoxError('UNAVAILABLE');
      tx.update(ref, {
        ownerUid: nextOwnerUid,
        version: (box.get('version') as number) + 1,
        updatedAt: Date.now(),
      });
      tx.update(ownerRef, { role: 'admin' });
      tx.update(nextRef, { role: 'owner' });
    });
  }

  public async changeRole(
    boxId: string,
    actorUid: string,
    memberUid: string,
    role: 'admin' | 'member',
  ): Promise<void> {
    if (actorUid === memberUid) throw new NativeBoxError('INVALID');
    const ref = this.box(boxId);
    await this.db.runTransaction(async (tx) => {
      const [box, actor, member, account, memberAccount] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection('members').doc(actorUid)),
        tx.get(ref.collection('members').doc(memberUid)),
        tx.get(this.db.collection('nativeAccounts').doc(actorUid)),
        tx.get(this.db.collection('nativeAccounts').doc(memberUid)),
      ]);
      if (
        box.get('status') !== 'active' ||
        !active(account) ||
        !active(memberAccount) ||
        !active(actor) ||
        !active(member) ||
        member.get('role') === 'owner' ||
        member.get('role') === role ||
        (actor.get('role') !== 'owner' &&
          !(
            actor.get('role') === 'admin' &&
            role === 'admin' &&
            member.get('role') === 'member'
          ))
      )
        throw new NativeBoxError('UNAVAILABLE');
      tx.update(member.ref, { role });
      tx.update(ref, { updatedAt: Date.now() });
    });
  }

  public async removeMember(
    boxId: string,
    actorUid: string,
    memberUid: string,
  ): Promise<void> {
    const ref = this.box(boxId);
    const cleanupId = randomUUID();
    await this.db.runTransaction(async (tx) => {
      const [box, actor, member, account] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection('members').doc(actorUid)),
        tx.get(ref.collection('members').doc(memberUid)),
        tx.get(this.db.collection('nativeAccounts').doc(actorUid)),
      ]);
      if (
        box.get('status') !== 'active' ||
        !active(account) ||
        !active(actor) ||
        !active(member) ||
        member.get('role') === 'owner' ||
        (actorUid !== memberUid &&
          actor.get('role') !== 'owner' &&
          actor.get('role') !== 'admin')
      )
        throw new NativeBoxError('UNAVAILABLE');
      tx.update(member.ref, {
        role: 'member',
        status: actorUid === memberUid ? 'left' : 'removed',
      });
      tx.update(ref, {
        memberCount: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });
      tx.delete(
        this.db
          .collection('nativeAccounts')
          .doc(memberUid)
          .collection('boxRefs')
          .doc(boxId),
      );
      tx.create(
        this.db.collection('nativeJobs').doc(`feed-leave-${cleanupId}`),
        {
          type: 'feed',
          mode: 'leave',
          boxId,
          uid: memberUid,
          cursor: null,
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      );
    });
  }
}
