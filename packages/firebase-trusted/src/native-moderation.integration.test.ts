import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeInteractionIndex } from './native-interaction-index.js';
import { NativeModeration } from './native-moderation.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Auth and Firestore emulators required');
const app = initializeApp({ projectId: 'demo-paldora' }, `mod-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const moderation = new NativeModeration(db);
const index = new NativeInteractionIndex(db);
afterAll(() => deleteApp(app));

async function user() {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid);
  return uid;
}
const reason = 'Reviewed the reported target and confirmed the decision.';

describe('trusted moderation', () => {
  it('reports every target without leaking the queue and closes content reads before cleanup', async () => {
    const owner = await user();
    const reporter = await user();
    const outsider = await user();
    const staff = await user();
    const reviewer = await user();
    await db
      .collection('nativeAccounts')
      .doc(owner)
      .update({ username: `member-${owner.slice(0, 8)}` });
    await db
      .collection('nativeStaffGrants')
      .doc(staff)
      .set({ status: 'active', role: 'administrator' });
    await db
      .collection('nativeStaffGrants')
      .doc(reviewer)
      .set({ status: 'active', role: 'moderator' });
    const box = await boxes.create(owner, 'Moderated');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(reporter)
      .set({ uid: reporter, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Content');
    const commentId = await posts.createComment(box.id, postId, owner, 'Reply');
    const inputs = [
      { targetKind: 'user' as const, targetId: owner },
      { targetKind: 'box' as const, targetId: box.id },
      { targetKind: 'post' as const, targetId: postId },
      { targetKind: 'comment' as const, targetId: commentId },
    ];
    const cases = [];
    for (const input of inputs)
      cases.push(
        await moderation.createReport(reporter, {
          ...input,
          category: 'privacy',
          detail: 'Review this',
        }),
      );
    expect((await moderation.myReports(reporter)).items).toHaveLength(4);
    await expect(moderation.cases(outsider, 'open')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      (await moderation.cases(reviewer, 'open')).items.length,
    ).toBeGreaterThan(0);
    await expect(moderation.account(reviewer, owner)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      moderation.createReport(outsider, {
        targetKind: 'post',
        targetId: postId,
        category: 'privacy',
        detail: null,
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const postCase = cases[2]!;
    const command = {
      action: 'hide' as const,
      reason,
      idempotencyKey: randomUUID(),
    };
    await moderation.actOnCase(staff, postCase.id, command);
    await moderation.actOnCase(staff, postCase.id, command);
    await expect(posts.get(box.id, postId, reporter)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(
      (await moderation.notices(owner)).map((item) => item.targetId),
    ).toContain(postId);
    await moderation.actOnCase(staff, postCase.id, {
      action: 'restore',
      reason,
      idempotencyKey: randomUUID(),
    });
    expect((await posts.get(box.id, postId, reporter)).id).toBe(postId);
    const commentCase = cases[3]!;
    const competing = await Promise.allSettled(
      [0, 1].map(() =>
        moderation.actOnCase(staff, commentCase.id, {
          action: 'hide',
          reason,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(
      competing.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(competing.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      posts.commentDetail(box.id, postId, commentId, reporter),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await moderation.redactClosedReports(
      Date.now() + 91 * 24 * 60 * 60 * 1_000,
    );
    const redacted = await db
      .collection('nativeReports')
      .doc(postCase.id)
      .get();
    expect(redacted.get('detail')).toBeUndefined();
    expect(redacted.get('reporterUid')).toBeUndefined();
  });
  it('keeps the interaction index exact across comment hide, restore and author delete', async () => {
    const owner = await user();
    const member = await user();
    const staff = await user();
    await db
      .collection('nativeStaffGrants')
      .doc(staff)
      .set({ status: 'active', role: 'administrator' });
    const box = await boxes.create(owner, 'Indexed moderation');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(member)
      .set({ uid: member, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Content');
    const kept = await posts.createComment(box.id, postId, member, 'Kept');
    const target = await posts.createComment(box.id, postId, member, 'Target');
    const postRef = db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('posts')
      .doc(postId);
    const count = async () =>
      (await postRef.get()).get(
        new FieldPath('interactionIndex', 'comments', member),
      ) as number | undefined;
    expect(await count()).toBe(2);
    const report = await moderation.createReport(owner, {
      targetKind: 'comment',
      targetId: target,
      category: 'privacy',
      detail: 'Review this',
    });
    const hide = {
      action: 'hide' as const,
      reason,
      idempotencyKey: randomUUID(),
    };
    await moderation.actOnCase(staff, report.id, hide);
    await moderation.actOnCase(staff, report.id, hide);
    expect(await count()).toBe(1);
    expect((await index.check(box.id, postId)).ok).toBe(true);
    await moderation.actOnCase(staff, report.id, {
      action: 'restore',
      reason,
      idempotencyKey: randomUUID(),
    });
    expect(await count()).toBe(2);
    expect((await index.check(box.id, postId)).ok).toBe(true);
    // Hide a second comment through a fresh case, then let its author delete it.
    const second = await moderation.createReport(owner, {
      targetKind: 'comment',
      targetId: kept,
      category: 'privacy',
      detail: null,
    });
    await moderation.actOnCase(staff, second.id, {
      action: 'hide',
      reason,
      idempotencyKey: randomUUID(),
    });
    expect(await count()).toBe(1);
    await posts.deleteComment(box.id, postId, kept, member);
    expect(await count()).toBe(1);
    expect((await index.check(box.id, postId)).ok).toBe(true);
    await expect(
      moderation.actOnCase(staff, second.id, {
        action: 'restore',
        reason,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(await count()).toBe(1);
    expect((await index.check(box.id, postId)).ok).toBe(true);
  });
  it('audits staff grant and revoke and rejects invalid targets without audit rows', async () => {
    const target = await user();
    const suspended = await user();
    await db
      .collection('nativeAccounts')
      .doc(suspended)
      .update({ status: 'suspended' });
    const audit = async (uid: string) =>
      (
        await db
          .collection('nativeModerationAudit')
          .where('targetUid', '==', uid)
          .get()
      ).docs;
    await expect(moderation.cases(target, 'open')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await moderation.grantStaff('ops.local', target, 'moderator');
    await expect(moderation.cases(target, 'open')).resolves.toBeDefined();
    const granted = await audit(target);
    expect(granted).toHaveLength(1);
    expect(Object.keys(granted[0]!.data()).sort()).toEqual(
      [
        'action',
        'createdAt',
        'operator',
        'previousRole',
        'previousStatus',
        'role',
        'staffUid',
        'targetUid',
      ].sort(),
    );
    expect(granted[0]!.data()).toMatchObject({
      action: 'staff.grant',
      operator: 'ops.local',
      staffUid: null,
      role: 'moderator',
      previousStatus: null,
      previousRole: null,
    });
    await moderation.revokeStaff('ops.local', target);
    await expect(moderation.cases(target, 'open')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const revoked = (await audit(target)).find(
      (row) => row.get('action') === 'staff.revoke',
    );
    expect(revoked?.data()).toMatchObject({
      operator: 'ops.local',
      staffUid: null,
      previousStatus: 'active',
      previousRole: 'moderator',
    });
    expect(
      (await db.collection('nativeStaffGrants').doc(target).get()).get(
        'status',
      ),
    ).toBe('revoked');
    await expect(
      moderation.grantStaff('ops.local', suspended, 'moderator'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      moderation.grantStaff('ops.local', randomUUID(), 'moderator'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      moderation.revokeStaff('ops.local', suspended),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      moderation.grantStaff('ops.local', target, 'owner' as 'moderator'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await expect(
      moderation.grantStaff('a@b.com', target, 'moderator'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(await audit(suspended)).toHaveLength(0);
    expect(await audit(target)).toHaveLength(2);
  });
  it('flags a break-glass staff grant in its audit row (hosted bootstrap, ADR 020)', async () => {
    const target = await user();
    await moderation.grantStaff('owner.main', target, 'administrator', {
      breakGlass: true,
    });
    const rows = (
      await db
        .collection('nativeModerationAudit')
        .where('targetUid', '==', target)
        .get()
    ).docs;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data()).toMatchObject({
      action: 'staff.grant',
      operator: 'owner.main',
      role: 'administrator',
      breakGlass: true,
    });
  });
});
