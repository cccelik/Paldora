import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeBlockPairs } from './native-block-pairs.js';
import {
  NativeBoxInvitations,
  nativeBlockPairId,
  nativeInvitationId,
} from './native-box-invitations.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `invite-${randomUUID()}`,
);
const db = getFirestore(app);
const invitations = new NativeBoxInvitations(db);
const blocks = new NativeBlockPairs(db);
afterAll(() => deleteApp(app));

async function seed() {
  const boxId = randomUUID();
  const owner = randomUUID();
  const guest = randomUUID();
  const outsider = randomUUID();
  const batch = db.batch();
  for (const uid of [owner, guest, outsider])
    batch.set(db.collection('nativeAccounts').doc(uid), { status: 'active' });
  batch.set(db.collection('nativeBoxes').doc(boxId), {
    id: boxId,
    name: 'Crew',
    ownerUid: owner,
    status: 'active',
    version: 1,
    memberCount: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  });
  batch.set(
    db.collection('nativeBoxes').doc(boxId).collection('members').doc(owner),
    {
      uid: owner,
      role: 'owner',
      status: 'active',
    },
  );
  await batch.commit();
  return { boxId, owner, guest, outsider };
}

describe('trusted native Box invitations', () => {
  it('lists pending invitations only for current Box managers', async () => {
    const { boxId, owner, guest, outsider } = await seed();
    await db
      .collection('nativeAccounts')
      .doc(guest)
      .update({ username: 'Guest' });
    const id = await invitations.invite(boxId, owner, guest, 1_000);
    expect(
      (await invitations.listForBox(boxId, owner, undefined, 1_001)).items,
    ).toMatchObject([
      {
        id,
        boxId,
        inviteeUid: guest,
        inviteeUsername: 'Guest',
        inviterUid: owner,
        expiresAt: 1_000 + 7 * 24 * 60 * 60 * 1_000,
      },
    ]);
    await expect(
      invitations.listForBox(boxId, outsider, undefined, 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(outsider)
      .set({ uid: outsider, role: 'admin', status: 'active' });
    expect(
      (await invitations.listForBox(boxId, outsider, undefined, 1_001)).items,
    ).toHaveLength(1);
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(owner, guest))
      .set({ blockedBy: [owner], epoch: 1 });
    expect(
      (await invitations.listForBox(boxId, owner, undefined, 1_001)).items,
    ).toEqual([]);
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .update({ status: 'deleting' });
    await expect(
      invitations.listForBox(boxId, owner, undefined, 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('normalizes usernames and rechecks the reserved mapping in the transaction', async () => {
    const { boxId, owner, guest, outsider } = await seed();
    await db.collection('nativeUsernames').doc('zoe').set({ uid: guest });
    const id = await invitations.inviteByUsername(boxId, owner, ' Zoë ', 1_000);
    expect(id).toBe(nativeInvitationId(boxId, guest));
    await expect(
      invitations.inviteByUsername(boxId, owner, 'missing', 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      invitations.invite(boxId, owner, outsider, 1_001, 'zoe'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('accepts once and creates membership plus the private Box hint', async () => {
    const { boxId, owner, guest } = await seed();
    const invitationId = await invitations.invite(boxId, owner, guest, 1_000);
    expect(invitationId).toBe(nativeInvitationId(boxId, guest));
    await expect(
      invitations.invite(boxId, owner, guest, 1_001),
    ).rejects.toMatchObject({ code: 'ALREADY_PENDING' });
    await expect(
      invitations.accept(invitationId, owner, 1_002),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(invitations.accept(invitationId, guest, 1_002)).resolves.toBe(
      boxId,
    );
    expect(
      (await db.collection('nativeBoxes').doc(boxId).get()).get('memberCount'),
    ).toBe(2);
    expect(
      (
        await db
          .collection('nativeBoxes')
          .doc(boxId)
          .collection('members')
          .doc(guest)
          .get()
      ).data(),
    ).toMatchObject({ uid: guest, role: 'member', status: 'active' });
    expect(
      (
        await db
          .collection('nativeAccounts')
          .doc(guest)
          .collection('boxRefs')
          .doc(boxId)
          .get()
      ).data(),
    ).toEqual({ boxId });
    await expect(
      invitations.accept(invitationId, guest, 1_003),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it.each(['removed', 'demoted', 'suspended'] as const)(
    'rejects a pending invitation after its inviter is %s',
    async (change) => {
      const { boxId, owner, guest } = await seed();
      const invitationId = await invitations.invite(boxId, owner, guest, 1_000);
      if (change === 'suspended')
        await db
          .collection('nativeAccounts')
          .doc(owner)
          .update({ status: 'suspended' });
      else
        await db
          .collection('nativeBoxes')
          .doc(boxId)
          .collection('members')
          .doc(owner)
          .update({
            ...(change === 'removed'
              ? { status: 'removed' }
              : { role: 'member' }),
          });
      await expect(
        invitations.accept(invitationId, guest, 1_001),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(
        (await invitations.listPending(guest, undefined, 1_001)).items,
      ).toEqual([]);
      expect(
        (
          await db
            .collection('nativeBoxes')
            .doc(boxId)
            .collection('members')
            .doc(guest)
            .get()
        ).exists,
      ).toBe(false);
    },
  );

  it('requires an active owner or admin and an open Box', async () => {
    const { boxId, owner, guest, outsider } = await seed();
    await expect(
      invitations.invite(boxId, outsider, guest),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(outsider)
      .set({
        uid: outsider,
        role: 'member',
        status: 'active',
      });
    await expect(
      invitations.invite(boxId, outsider, guest),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .update({ status: 'archived' });
    await expect(invitations.invite(boxId, owner, guest)).rejects.toMatchObject(
      { code: 'UNAVAILABLE' },
    );
  });

  it('rechecks blocks and expiry before acceptance', async () => {
    const first = await seed();
    const id = await invitations.invite(
      first.boxId,
      first.owner,
      first.guest,
      1_000,
    );
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(first.owner, first.guest))
      .set({ blockedBy: [first.owner] });
    await expect(
      invitations.accept(id, first.guest, 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const second = await seed();
    const expiredId = await invitations.invite(
      second.boxId,
      second.owner,
      second.guest,
      1_000,
    );
    await expect(
      invitations.accept(
        expiredId,
        second.guest,
        1_000 + 7 * 24 * 60 * 60 * 1_000,
      ),
    ).rejects.toMatchObject({ code: 'EXPIRED' });
  });

  it('refuses blocked or suspended recipients before creating an invitation', async () => {
    const blockedPair = await seed();
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(blockedPair.owner, blockedPair.guest))
      .set({ blockedBy: [blockedPair.guest] });
    await expect(
      invitations.invite(
        blockedPair.boxId,
        blockedPair.owner,
        blockedPair.guest,
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const suspended = await seed();
    await db
      .collection('nativeAccounts')
      .doc(suspended.guest)
      .update({ status: 'suspended' });
    await expect(
      invitations.invite(suspended.boxId, suspended.owner, suspended.guest),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('never revives a pending invitation after a block is lifted', async () => {
    const { boxId, owner, guest } = await seed();
    const invitationId = await invitations.invite(boxId, owner, guest, 1_000);
    await blocks.setBlocked(guest, owner, true);
    await blocks.setBlocked(guest, owner, false);
    const pair = await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(owner, guest))
      .get();
    expect(pair.data()).toMatchObject({
      users: [owner, guest].sort(),
      blockedBy: [],
      blockedAtBy: {},
      epoch: 1,
    });
    await expect(
      invitations.accept(invitationId, guest, 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const replacement = await invitations.invite(boxId, owner, guest, 1_002);
    expect(replacement).toBe(invitationId);
    await expect(invitations.accept(replacement, guest, 1_003)).resolves.toBe(
      boxId,
    );
  });

  it('lists only currently visible pending invitations for the invitee', async () => {
    const { boxId, owner, guest, outsider } = await seed();
    const id = await invitations.invite(boxId, owner, guest, 1_000);
    expect(
      await invitations.listPending(guest, undefined, 1_001),
    ).toMatchObject({
      items: [{ id, boxId, inviterUid: owner }],
      nextCursor: null,
    });
    expect(
      (await invitations.listPending(outsider, undefined, 1_001)).items,
    ).toEqual([]);
    await blocks.setBlocked(guest, owner, true);
    expect(
      (await invitations.listPending(guest, undefined, 1_002)).items,
    ).toEqual([]);
    await blocks.setBlocked(guest, owner, false);
    expect(
      (await invitations.listPending(guest, undefined, 1_003)).items,
    ).toEqual([]);
  });

  it('serializes concurrent acceptance and refuses an already active member', async () => {
    const { boxId, owner, guest } = await seed();
    const id = await invitations.invite(boxId, owner, guest, 1_000);
    const results = await Promise.allSettled([
      invitations.accept(id, guest, 1_001),
      invitations.accept(id, guest, 1_001),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(
      invitations.invite(boxId, owner, guest, 1_002),
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('allows invitees to decline and managers to revoke pending invitations', async () => {
    const first = await seed();
    const declineId = await invitations.invite(
      first.boxId,
      first.owner,
      first.guest,
      1_000,
    );
    await expect(
      invitations.decline(declineId, first.owner, 1_001),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await invitations.decline(declineId, first.guest, 1_001);
    await expect(
      invitations.accept(declineId, first.guest, 1_002),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    const second = await seed();
    const revokeId = await invitations.invite(
      second.boxId,
      second.owner,
      second.guest,
      1_000,
    );
    await db
      .collection('nativeBoxes')
      .doc(second.boxId)
      .collection('members')
      .doc(second.outsider)
      .set({ uid: second.outsider, role: 'member', status: 'active' });
    await expect(
      invitations.revoke(revokeId, second.boxId, second.outsider, 1_001),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await invitations.revoke(revokeId, second.boxId, second.owner, 1_001);
    await expect(
      invitations.accept(revokeId, second.guest, 1_002),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('commits only one of accept and revoke when they race', async () => {
    const { boxId, owner, guest } = await seed();
    const id = await invitations.invite(boxId, owner, guest, 1_000);
    const outcomes = await Promise.allSettled([
      invitations.accept(id, guest, 1_001),
      invitations.revoke(id, boxId, owner, 1_001),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const invitation = await db
      .collection('nativeBoxInvitations')
      .doc(id)
      .get();
    const membership = await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(guest)
      .get();
    expect(membership.exists).toBe(invitation.get('status') === 'accepted');
  });
});
