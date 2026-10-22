import type { Firestore } from 'firebase-admin/firestore';

export interface PrototypeBox {
  id: string;
  name: string;
  ownerId: string;
  status: 'active' | 'archived';
  version: number;
}

export interface PrototypeMembership {
  boxId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'left' | 'removed';
}

export class BoxPrototypeError extends Error {
  public constructor(
    public readonly code:
      | 'BOX_NOT_FOUND'
      | 'BOX_ACCESS_DENIED'
      | 'BOX_MEMBER_NOT_FOUND'
      | 'BOX_OWNER_CANNOT_LEAVE'
      | 'BOX_ARCHIVED'
      | 'BOX_ACTION_UNAVAILABLE',
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

  public async addMember(boxId: string, actorId: string, userId: string) {
    const boxRef = this.boxRef(boxId);
    const actorRef = this.memberRef(boxId, actorId);
    const memberRef = this.memberRef(boxId, userId);
    await this.db.runTransaction(async (tx) => {
      const [box, actor, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(actorRef),
        tx.get(memberRef),
      ]);
      if (!box.exists) throw new BoxPrototypeError('BOX_NOT_FOUND');
      const row = box.data() as PrototypeBox;
      const actorData = actor.data() as PrototypeMembership | undefined;
      if (actorData?.status !== 'active')
        throw new BoxPrototypeError('BOX_NOT_FOUND');
      if (actorData.role === 'member')
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      if (row.status === 'archived')
        throw new BoxPrototypeError('BOX_ARCHIVED');
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
      if (
        (oldMember.data() as PrototypeMembership | undefined)?.status !==
        'active'
      )
        throw new BoxPrototypeError('BOX_NOT_FOUND');
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
      tx.update(oldRef, { role: 'admin' });
      tx.update(nextRef, { role: 'owner' });
    });
  }

  public async changeRole(
    boxId: string,
    actorId: string,
    targetId: string,
    next: 'admin' | 'member',
  ) {
    const boxRef = this.boxRef(boxId);
    const actorRef = this.memberRef(boxId, actorId);
    const targetRef = this.memberRef(boxId, targetId);
    await this.db.runTransaction(async (tx) => {
      const [box, actor, target] = await Promise.all([
        tx.get(boxRef),
        tx.get(actorRef),
        tx.get(targetRef),
      ]);
      if (
        !box.exists ||
        (actor.data() as PrototypeMembership | undefined)?.status !== 'active'
      )
        throw new BoxPrototypeError('BOX_NOT_FOUND');
      const actorRole = (actor.data() as PrototypeMembership).role;
      if (actorRole === 'member')
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      const targetData = target.data() as PrototypeMembership | undefined;
      if (targetData?.status !== 'active')
        throw new BoxPrototypeError('BOX_MEMBER_NOT_FOUND');
      if (
        targetData.role === 'owner' ||
        targetData.role === next ||
        (actorRole === 'admin' &&
          (targetData.role !== 'member' || next !== 'admin'))
      )
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      tx.update(targetRef, { role: next });
    });
  }

  public async setStatus(
    boxId: string,
    ownerId: string,
    status: 'active' | 'archived',
  ) {
    const boxRef = this.boxRef(boxId);
    const ownerRef = this.memberRef(boxId, ownerId);
    await this.db.runTransaction(async (tx) => {
      const [box, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(ownerRef),
      ]);
      if (
        !box.exists ||
        (member.data() as PrototypeMembership | undefined)?.status !== 'active'
      )
        throw new BoxPrototypeError('BOX_NOT_FOUND');
      if ((box.data() as PrototypeBox).ownerId !== ownerId)
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      tx.update(boxRef, { status });
    });
  }

  public async remove(boxId: string, actorId: string, userId: string) {
    const boxRef = this.boxRef(boxId);
    const actorRef = this.memberRef(boxId, actorId);
    const memberRef = this.memberRef(boxId, userId);
    await this.db.runTransaction(async (tx) => {
      const [box, actor, member] = await Promise.all([
        tx.get(boxRef),
        tx.get(actorRef),
        tx.get(memberRef),
      ]);
      if (
        !box.exists ||
        (actor.data() as PrototypeMembership | undefined)?.status !== 'active'
      )
        throw new BoxPrototypeError('BOX_NOT_FOUND');
      const actorRole = (actor.data() as PrototypeMembership).role;
      const leaving = actorId === userId;
      if (leaving && actorRole === 'owner')
        throw new BoxPrototypeError('BOX_OWNER_CANNOT_LEAVE');
      if (!leaving && actorRole === 'member')
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      const target = member.data() as PrototypeMembership | undefined;
      if (target?.status !== 'active')
        throw new BoxPrototypeError('BOX_MEMBER_NOT_FOUND');
      if (!leaving && target.role === 'owner')
        throw new BoxPrototypeError('BOX_ACCESS_DENIED');
      tx.update(memberRef, {
        role: 'member',
        status: leaving ? 'left' : 'removed',
      });
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
