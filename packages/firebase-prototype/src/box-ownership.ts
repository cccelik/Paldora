import type { Firestore } from 'firebase-admin/firestore';

export interface PrototypeBox {
  id: string;
  name: string;
  ownerId: string;
  status: 'active';
  version: number;
}

export interface PrototypeMembership {
  boxId: string;
  userId: string;
  role: 'owner' | 'member';
  status: 'active' | 'removed';
}

export class BoxPrototypeError extends Error {
  public constructor(
    public readonly code:
      'BOX_NOT_FOUND' | 'BOX_ACCESS_DENIED' | 'BOX_ACTION_UNAVAILABLE',
  ) {
    super(code);
  }
}

/**
 * Experimental Firestore transaction shape for Phase 0's ownership gate.
 * It has no API or invitation path and must never be imported by production.
 */
export class BoxOwnershipPrototype {
  public constructor(private readonly db: Firestore) {}

  private boxRef(boxId: string) {
    return this.db.collection('prototypeBoxes').doc(boxId);
  }

  private memberRef(boxId: string, userId: string) {
    return this.db.collection('prototypeBoxMembers').doc(`${boxId}_${userId}`);
  }

  public async create(boxId: string, ownerId: string, name: string) {
    const boxRef = this.boxRef(boxId);
    const ownerRef = this.memberRef(boxId, ownerId);
    await this.db.runTransaction(async (tx) => {
      const [existingBox, existingOwner] = await Promise.all([
        tx.get(boxRef),
        tx.get(ownerRef),
      ]);
      if (existingBox.exists || existingOwner.exists)
        throw new BoxPrototypeError('BOX_ACTION_UNAVAILABLE');
      tx.create(boxRef, {
        id: boxId,
        name,
        ownerId,
        status: 'active',
        version: 1,
      } satisfies PrototypeBox);
      tx.create(ownerRef, {
        boxId,
        userId: ownerId,
        role: 'owner',
        status: 'active',
      } satisfies PrototypeMembership);
    });
  }

  public async addMember(boxId: string, ownerId: string, userId: string) {
    const boxRef = this.boxRef(boxId);
    const memberRef = this.memberRef(boxId, userId);
    await this.db.runTransaction(async (tx) => {
      const [box, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(memberRef),
      ]);
      if (!box.exists) throw new BoxPrototypeError('BOX_NOT_FOUND');
      const row = box.data() as PrototypeBox;
      if (row.ownerId !== ownerId)
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      if (
        member.exists &&
        (member.data() as PrototypeMembership).status === 'active'
      )
        throw new BoxPrototypeError('BOX_ACTION_UNAVAILABLE');
      tx.set(memberRef, {
        boxId,
        userId,
        role: 'member',
        status: 'active',
      } satisfies PrototypeMembership);
    });
  }

  public async transfer(boxId: string, ownerId: string, nextOwnerId: string) {
    const boxRef = this.boxRef(boxId);
    const oldRef = this.memberRef(boxId, ownerId);
    const nextRef = this.memberRef(boxId, nextOwnerId);
    await this.db.runTransaction(async (tx) => {
      const [box, oldMember, nextMember] = await Promise.all([
        tx.get(boxRef),
        tx.get(oldRef),
        tx.get(nextRef),
      ]);
      if (!box.exists) throw new BoxPrototypeError('BOX_NOT_FOUND');
      const row = box.data() as PrototypeBox;
      if (row.ownerId !== ownerId)
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      if (
        nextOwnerId === ownerId ||
        !oldMember.exists ||
        !nextMember.exists ||
        (oldMember.data() as PrototypeMembership).status !== 'active' ||
        (oldMember.data() as PrototypeMembership).role !== 'owner' ||
        (nextMember.data() as PrototypeMembership).status !== 'active'
      )
        throw new BoxPrototypeError('BOX_ACTION_UNAVAILABLE');
      tx.update(boxRef, { ownerId: nextOwnerId, version: row.version + 1 });
      tx.update(oldRef, { role: 'member' });
      tx.update(nextRef, { role: 'owner' });
    });
  }

  public async remove(boxId: string, ownerId: string, userId: string) {
    const boxRef = this.boxRef(boxId);
    const memberRef = this.memberRef(boxId, userId);
    await this.db.runTransaction(async (tx) => {
      const [box, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(memberRef),
      ]);
      if (!box.exists) throw new BoxPrototypeError('BOX_NOT_FOUND');
      const row = box.data() as PrototypeBox;
      if (row.ownerId !== ownerId)
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      if (
        userId === ownerId ||
        !member.exists ||
        (member.data() as PrototypeMembership).status !== 'active'
      )
        throw new BoxPrototypeError('BOX_ACTION_UNAVAILABLE');
      tx.update(memberRef, { role: 'member', status: 'removed' });
    });
  }

  public async read(
    boxId: string,
    viewerId: string,
  ): Promise<PrototypeBox | null> {
    const [box, membership] = await Promise.all([
      this.boxRef(boxId).get(),
      this.memberRef(boxId, viewerId).get(),
    ]);
    if (!box.exists || !membership.exists) return null;
    const member = membership.data() as PrototypeMembership;
    return member.status === 'active' ? (box.data() as PrototypeBox) : null;
  }

  /** Inspection for migration tests only; no production API exposes this. */
  public async inspect(boxId: string) {
    const [box, memberships] = await Promise.all([
      this.boxRef(boxId).get(),
      this.db
        .collection('prototypeBoxMembers')
        .where('boxId', '==', boxId)
        .get(),
    ]);
    return {
      box: box.data() as PrototypeBox | undefined,
      memberships: memberships.docs.map(
        (doc) => doc.data() as PrototypeMembership,
      ),
    };
  }
}
