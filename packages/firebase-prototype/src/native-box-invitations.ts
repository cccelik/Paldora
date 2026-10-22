import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

function digest(parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function nativeInvitationId(boxId: string, inviteeUid: string): string {
  return digest([boxId, inviteeUid]);
}

export function nativeBlockPairId(first: string, second: string): string {
  return digest([first, second].sort());
}

export class NativeInvitationError extends Error {
  public constructor(
    public readonly code:
      | 'UNAVAILABLE'
      | 'FORBIDDEN'
      | 'ALREADY_MEMBER'
      | 'ALREADY_PENDING'
      | 'EXPIRED',
  ) {
    super(code);
  }
}

function active(snapshot: DocumentSnapshot): boolean {
  return snapshot.exists && snapshot.get('status') === 'active';
}

function blocked(snapshot: DocumentSnapshot): boolean {
  return (
    snapshot.exists &&
    Boolean((snapshot.get('blockedBy') as string[] | undefined)?.length)
  );
}

/**
 * Trusted transaction prototype. A future callable wrapper must derive the
 * caller UID from verified Firebase Auth, never a request body. Username
 * resolution, rate limits, listing, revocation and block writes remain closed.
 */
export class NativeBoxInvitations {
  public constructor(private readonly db: Firestore) {}

  public async invite(
    boxId: string,
    inviterUid: string,
    inviteeUid: string,
    now = Date.now(),
  ): Promise<string> {
    if (inviterUid === inviteeUid) throw new NativeInvitationError('FORBIDDEN');
    const invitationId = nativeInvitationId(boxId, inviteeUid);
    const invitationRef = this.db
      .collection('nativeBoxInvitations')
      .doc(invitationId);
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const inviterRef = this.db.collection('nativeAccounts').doc(inviterUid);
    const inviteeRef = this.db.collection('nativeAccounts').doc(inviteeUid);
    const actorMemberRef = boxRef.collection('members').doc(inviterUid);
    const targetMemberRef = boxRef.collection('members').doc(inviteeUid);
    const blockRef = this.db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(inviterUid, inviteeUid));
    await this.db.runTransaction(async (tx) => {
      const [box, inviter, invitee, actor, target, block, existing] =
        await Promise.all([
          tx.get(boxRef),
          tx.get(inviterRef),
          tx.get(inviteeRef),
          tx.get(actorMemberRef),
          tx.get(targetMemberRef),
          tx.get(blockRef),
          tx.get(invitationRef),
        ]);
      if (
        !active(box) ||
        !active(inviter) ||
        !active(invitee) ||
        !active(actor)
      )
        throw new NativeInvitationError('UNAVAILABLE');
      if (actor.get('role') !== 'owner' && actor.get('role') !== 'admin')
        throw new NativeInvitationError('FORBIDDEN');
      if (blocked(block)) throw new NativeInvitationError('UNAVAILABLE');
      if (target.exists && target.get('status') === 'active')
        throw new NativeInvitationError('ALREADY_MEMBER');
      if (
        existing.exists &&
        existing.get('status') === 'pending' &&
        existing.get('expiresAt') > now
      )
        throw new NativeInvitationError('ALREADY_PENDING');
      tx.set(invitationRef, {
        boxId,
        inviterUid,
        inviteeUid,
        status: 'pending',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
        respondedAt: null,
      });
    });
    return invitationId;
  }

  public async accept(
    invitationId: string,
    inviteeUid: string,
    now = Date.now(),
  ): Promise<string> {
    const invitationRef = this.db
      .collection('nativeBoxInvitations')
      .doc(invitationId);
    return this.db.runTransaction(async (tx) => {
      const invitation = await tx.get(invitationRef);
      if (
        !invitation.exists ||
        invitation.get('inviteeUid') !== inviteeUid ||
        invitation.get('status') !== 'pending'
      )
        throw new NativeInvitationError('UNAVAILABLE');
      const boxId = invitation.get('boxId') as string;
      const inviterUid = invitation.get('inviterUid') as string;
      const boxRef = this.db.collection('nativeBoxes').doc(boxId);
      const inviteeRef = this.db.collection('nativeAccounts').doc(inviteeUid);
      const memberRef = boxRef.collection('members').doc(inviteeUid);
      const blockRef = this.db
        .collection('nativeBlockPairs')
        .doc(nativeBlockPairId(inviterUid, inviteeUid));
      const [box, invitee, member, block] = await Promise.all([
        tx.get(boxRef),
        tx.get(inviteeRef),
        tx.get(memberRef),
        tx.get(blockRef),
      ]);
      if (!active(box) || !active(invitee) || blocked(block))
        throw new NativeInvitationError('UNAVAILABLE');
      if (invitation.get('expiresAt') <= now)
        throw new NativeInvitationError('EXPIRED');
      if (member.exists && member.get('status') === 'active')
        throw new NativeInvitationError('ALREADY_MEMBER');
      tx.set(memberRef, { uid: inviteeUid, role: 'member', status: 'active' });
      tx.set(inviteeRef.collection('boxRefs').doc(boxId), { boxId });
      tx.update(invitationRef, { status: 'accepted', respondedAt: now });
      return boxId;
    });
  }
}
