import { createHash } from 'node:crypto';
import { normalizeUsername, usernameSchema } from '@paldora/validation';
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

function stableUuid(parts: string[]): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nativeInvitationId(boxId: string, inviteeUid: string): string {
  // Keep one deterministic invitation per Box/person while satisfying the
  // existing UUID route and form contract used by the web app.
  return stableUuid([boxId, inviteeUid]);
}

export function nativeBlockPairId(first: string, second: string): string {
  return stableUuid([first, second].sort());
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

function blockEpoch(snapshot: DocumentSnapshot): number {
  return snapshot.exists
    ? ((snapshot.get('epoch') as number | undefined) ?? 0)
    : 0;
}

function requireUsernameMapping(mapping: DocumentSnapshot, uid: string): void {
  if (!mapping.exists || mapping.get('uid') !== uid)
    throw new NativeInvitationError('UNAVAILABLE');
}

function pendingInEpoch(
  invitation: DocumentSnapshot,
  now: number,
  epoch: number,
): boolean {
  return (
    invitation.exists &&
    invitation.get('status') === 'pending' &&
    invitation.get('expiresAt') > now &&
    invitation.get('blockEpoch') === epoch
  );
}

function sentInvitationVisible(
  snapshots: {
    invitation: DocumentSnapshot;
    box: DocumentSnapshot;
    manager: DocumentSnapshot;
    membership: DocumentSnapshot;
    invitee: DocumentSnapshot;
    inviter: DocumentSnapshot;
    inviterMembership: DocumentSnapshot;
    inviteeMember: DocumentSnapshot;
    pair: DocumentSnapshot;
  },
  now: number,
): boolean {
  const {
    invitation,
    box,
    manager,
    membership,
    invitee,
    inviter,
    inviterMembership,
    inviteeMember,
    pair,
  } = snapshots;
  return (
    box.exists &&
    ['active', 'archived'].includes(box.get('status') as string) &&
    active(manager) &&
    active(membership) &&
    ['owner', 'admin'].includes(membership.get('role') as string) &&
    active(invitee) &&
    active(inviter) &&
    active(inviterMembership) &&
    ['owner', 'admin'].includes(inviterMembership.get('role') as string) &&
    !active(inviteeMember) &&
    pendingInEpoch(invitation, now, blockEpoch(pair)) &&
    !blocked(pair)
  );
}

/** Trusted invitation transactions; callable wrappers derive caller UID from Auth. */
export class NativeBoxInvitations {
  public constructor(private readonly db: Firestore) {}

  /** Bounded sender-side view for current Box managers. */
  public async listForBox(
    boxId: string,
    managerUid: string,
    cursor?: string,
    now = Date.now(),
    limit = 20,
  ): Promise<{
    items: Array<{
      id: string;
      boxId: string;
      inviteeUid: string;
      inviteeUsername: string | null;
      inviteeDisplayName: string | null;
      inviterUid: string;
      inviterUsername: string | null;
      inviterDisplayName: string | null;
      expiresAt: number;
      createdAt: number;
    }>;
    nextCursor: string | null;
  }> {
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const [box, account, membership] = await Promise.all([
      boxRef.get(),
      this.db.collection('nativeAccounts').doc(managerUid).get(),
      boxRef.collection('members').doc(managerUid).get(),
    ]);
    if (
      !box.exists ||
      !['active', 'archived'].includes(box.get('status') as string) ||
      !active(account) ||
      !active(membership) ||
      !['owner', 'admin'].includes(membership.get('role') as string)
    )
      throw new NativeInvitationError('UNAVAILABLE');
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query = this.db
      .collection('nativeBoxInvitations')
      .where('boxId', '==', boxId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(pageSize);
    if (cursor) {
      const marker = await this.db
        .collection('nativeBoxInvitations')
        .doc(cursor)
        .get();
      if (
        !marker.exists ||
        marker.get('boxId') !== boxId ||
        marker.get('status') !== 'pending'
      )
        throw new NativeInvitationError('UNAVAILABLE');
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map((candidate) =>
        this.db.runTransaction(async (tx) => {
          const invitation = await tx.get(candidate.ref);
          if (
            !invitation.exists ||
            invitation.get('boxId') !== boxId ||
            invitation.get('status') !== 'pending'
          )
            return null;
          const inviteeUid = invitation.get('inviteeUid') as string;
          const inviterUid = invitation.get('inviterUid') as string;
          const [
            boxNow,
            managerNow,
            roleNow,
            invitee,
            inviteeProfile,
            inviter,
            inviterProfile,
            inviterMembership,
            inviteeMember,
            pair,
          ] = await Promise.all([
            tx.get(boxRef),
            tx.get(this.db.collection('nativeAccounts').doc(managerUid)),
            tx.get(boxRef.collection('members').doc(managerUid)),
            tx.get(this.db.collection('nativeAccounts').doc(inviteeUid)),
            tx.get(this.db.collection('nativeProfiles').doc(inviteeUid)),
            tx.get(this.db.collection('nativeAccounts').doc(inviterUid)),
            tx.get(this.db.collection('nativeProfiles').doc(inviterUid)),
            tx.get(boxRef.collection('members').doc(inviterUid)),
            tx.get(boxRef.collection('members').doc(inviteeUid)),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(inviterUid, inviteeUid)),
            ),
          ]);
          if (
            !sentInvitationVisible(
              {
                invitation,
                box: boxNow,
                manager: managerNow,
                membership: roleNow,
                invitee,
                inviter,
                inviterMembership,
                inviteeMember,
                pair,
              },
              now,
            )
          )
            return null;
          return {
            id: candidate.id,
            boxId,
            inviteeUid,
            inviteeUsername:
              (invitee.get('username') as string | undefined) ?? null,
            inviteeDisplayName:
              (inviteeProfile.get('displayName') as string | null) ?? null,
            inviterUid,
            inviterUsername:
              (inviter.get('username') as string | undefined) ?? null,
            inviterDisplayName:
              (inviterProfile.get('displayName') as string | null) ?? null,
            expiresAt: invitation.get('expiresAt') as number,
            createdAt: invitation.get('createdAt') as number,
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

  public async listPending(
    inviteeUid: string,
    cursor?: string,
    now = Date.now(),
    limit = 20,
  ): Promise<{
    items: Array<{
      id: string;
      boxId: string;
      boxName: string;
      inviterUid: string;
      expiresAt: number;
      createdAt: number;
      inviterUsername: string;
      inviterDisplayName: string;
    }>;
    nextCursor: string | null;
  }> {
    const account = await this.db
      .collection('nativeAccounts')
      .doc(inviteeUid)
      .get();
    if (!active(account)) throw new NativeInvitationError('FORBIDDEN');
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query = this.db
      .collection('nativeBoxInvitations')
      .where('inviteeUid', '==', inviteeUid)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(pageSize);
    if (cursor) {
      const cursorDoc = await this.db
        .collection('nativeBoxInvitations')
        .doc(cursor)
        .get();
      if (
        !cursorDoc.exists ||
        cursorDoc.get('inviteeUid') !== inviteeUid ||
        cursorDoc.get('status') !== 'pending'
      )
        throw new NativeInvitationError('UNAVAILABLE');
      query = query.startAfter(cursorDoc);
    }
    const page = await query.get();
    const items = await Promise.all(
      page.docs.map(async (candidate) =>
        this.db.runTransaction(async (tx) => {
          const invitation = await tx.get(candidate.ref);
          if (
            invitation.get('inviteeUid') !== inviteeUid ||
            !pendingInEpoch(
              invitation,
              now,
              invitation.get('blockEpoch') as number,
            )
          )
            return null;
          const boxId = invitation.get('boxId') as string;
          const inviterUid = invitation.get('inviterUid') as string;
          const [
            accountNow,
            box,
            inviter,
            inviterProfile,
            inviterMembership,
            block,
          ] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(inviteeUid)),
            tx.get(this.db.collection('nativeBoxes').doc(boxId)),
            tx.get(this.db.collection('nativeAccounts').doc(inviterUid)),
            tx.get(this.db.collection('nativeProfiles').doc(inviterUid)),
            tx.get(
              this.db
                .collection('nativeBoxes')
                .doc(boxId)
                .collection('members')
                .doc(inviterUid),
            ),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(inviterUid, inviteeUid)),
            ),
          ]);
          if (
            !active(accountNow) ||
            !active(box) ||
            !active(inviter) ||
            !active(inviterMembership) ||
            !['owner', 'admin'].includes(
              inviterMembership.get('role') as string,
            ) ||
            blocked(block) ||
            invitation.get('blockEpoch') !== blockEpoch(block)
          )
            return null;
          return {
            id: candidate.id,
            boxId,
            boxName: box.get('name') as string,
            inviterUid,
            expiresAt: invitation.get('expiresAt') as number,
            createdAt: invitation.get('createdAt') as number,
            inviterUsername:
              (inviter.get('username') as string | undefined) ?? inviterUid,
            inviterDisplayName:
              (inviterProfile.get('displayName') as string | null) ||
              (inviter.get('username') as string | undefined) ||
              inviterUid,
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

  /** Resolve a public username; the transaction rechecks this mapping. */
  public async inviteByUsername(
    boxId: string,
    inviterUid: string,
    username: string,
    now = Date.now(),
  ): Promise<string> {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) throw new NativeInvitationError('UNAVAILABLE');
    const normalized = normalizeUsername(parsed.data);
    const mapping = await this.db
      .collection('nativeUsernames')
      .doc(normalized)
      .get();
    const inviteeUid = mapping.exists ? mapping.get('uid') : undefined;
    if (typeof inviteeUid !== 'string' || !inviteeUid)
      throw new NativeInvitationError('UNAVAILABLE');
    return this.invite(boxId, inviterUid, inviteeUid, now, normalized);
  }

  public async invite(
    boxId: string,
    inviterUid: string,
    inviteeUid: string,
    now = Date.now(),
    normalizedUsername?: string,
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
      const mapping = normalizedUsername
        ? await tx.get(
            this.db.collection('nativeUsernames').doc(normalizedUsername),
          )
        : null;
      if (mapping) requireUsernameMapping(mapping, inviteeUid);
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
      if (pendingInEpoch(existing, now, blockEpoch(block)))
        throw new NativeInvitationError('ALREADY_PENDING');
      tx.set(invitationRef, {
        boxId,
        inviterUid,
        inviteeUid,
        status: 'pending',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
        respondedAt: null,
        blockEpoch: blockEpoch(block),
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
      const [box, invitee, inviter, inviterMember, member, block] =
        await Promise.all([
          tx.get(boxRef),
          tx.get(inviteeRef),
          tx.get(this.db.collection('nativeAccounts').doc(inviterUid)),
          tx.get(boxRef.collection('members').doc(inviterUid)),
          tx.get(memberRef),
          tx.get(blockRef),
        ]);
      if (
        !active(box) ||
        !active(invitee) ||
        !active(inviter) ||
        !active(inviterMember) ||
        !['owner', 'admin'].includes(inviterMember.get('role') as string) ||
        blocked(block)
      )
        throw new NativeInvitationError('UNAVAILABLE');
      if (invitation.get('blockEpoch') !== blockEpoch(block))
        throw new NativeInvitationError('UNAVAILABLE');
      if (invitation.get('expiresAt') <= now)
        throw new NativeInvitationError('EXPIRED');
      if (member.exists && member.get('status') === 'active')
        throw new NativeInvitationError('ALREADY_MEMBER');
      tx.set(memberRef, {
        uid: inviteeUid,
        role: 'member',
        status: 'active',
        joinedAt: now,
      });
      tx.set(inviteeRef.collection('boxRefs').doc(boxId), { boxId });
      tx.update(boxRef, {
        memberCount: FieldValue.increment(1),
        updatedAt: now,
      });
      tx.update(invitationRef, { status: 'accepted', respondedAt: now });
      tx.create(
        this.db
          .collection('nativeJobs')
          .doc(`feed-join-${boxId}-${inviteeUid}-${now}`),
        {
          type: 'feed',
          mode: 'join',
          boxId,
          uid: inviteeUid,
          joinedAt: now,
          cursor: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      );
      return boxId;
    });
  }

  public async decline(
    invitationId: string,
    inviteeUid: string,
    now = Date.now(),
  ): Promise<void> {
    const invitationRef = this.db
      .collection('nativeBoxInvitations')
      .doc(invitationId);
    const accountRef = this.db.collection('nativeAccounts').doc(inviteeUid);
    await this.db.runTransaction(async (tx) => {
      const [invitation, account] = await Promise.all([
        tx.get(invitationRef),
        tx.get(accountRef),
      ]);
      if (
        !active(account) ||
        !invitation.exists ||
        invitation.get('inviteeUid') !== inviteeUid ||
        invitation.get('status') !== 'pending'
      )
        throw new NativeInvitationError('UNAVAILABLE');
      tx.update(invitationRef, { status: 'declined', respondedAt: now });
    });
  }

  public async revoke(
    invitationId: string,
    boxId: string,
    actorUid: string,
    now = Date.now(),
  ): Promise<void> {
    const invitationRef = this.db
      .collection('nativeBoxInvitations')
      .doc(invitationId);
    const accountRef = this.db.collection('nativeAccounts').doc(actorUid);
    const memberRef = this.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(actorUid);
    await this.db.runTransaction(async (tx) => {
      const [invitation, account, member] = await Promise.all([
        tx.get(invitationRef),
        tx.get(accountRef),
        tx.get(memberRef),
      ]);
      if (
        !active(account) ||
        !active(member) ||
        !invitation.exists ||
        invitation.get('boxId') !== boxId ||
        invitation.get('status') !== 'pending'
      )
        throw new NativeInvitationError('UNAVAILABLE');
      if (member.get('role') !== 'owner' && member.get('role') !== 'admin')
        throw new NativeInvitationError('FORBIDDEN');
      tx.update(invitationRef, { status: 'revoked', respondedAt: now });
    });
  }
}
