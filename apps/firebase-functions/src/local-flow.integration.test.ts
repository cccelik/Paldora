import { randomUUID } from 'node:crypto';
import {
  NativeBoxDeletion,
  NativeBoxes,
  NativeModeration,
} from '@paldora/firebase-trusted';
import { createBox, getBox } from '@paldora/firebase-native';
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable as sdkHttpsCallable,
  type Functions,
} from 'firebase/functions';
import { native } from '@paldora/validation';
import { afterAll, describe, expect, it } from 'vitest';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error(
    'This test requires the disposable Auth, Firestore, Storage, and Functions emulators',
  );

const registry = new Map(
  native.nativeCallableRegistry.map((entry) => [entry.name, entry]),
);
const exercised = new Set<string>();

/**
 * Every real response and error in this flow is checked against the frozen
 * native contract, so the registry cannot drift from what the callables return.
 */
function httpsCallable<Request = unknown, Response = unknown>(
  functions: Functions,
  name: string,
) {
  const call = sdkHttpsCallable<Request, Response>(functions, name);
  const entry = registry.get(name);
  return async (data?: Request) => {
    if (!entry) throw new Error(`${name} is missing from the native registry`);
    exercised.add(name);
    let result;
    try {
      result = await call(data);
    } catch (error) {
      const code = (error as { code?: string }).code?.replace(
        /^functions\//,
        '',
      );
      if (code)
        expect(entry.errors, `${name} raised an undeclared ${code}`).toContain(
          code,
        );
      const reason = (error as { details?: { reason?: unknown } }).details
        ?.reason;
      if (reason !== undefined)
        expect(
          native.nativeErrorReasonSchema.safeParse(reason).success,
          `${name} raised an unknown reason`,
        ).toBe(true);
      throw error;
    }
    const parsed = entry.output.safeParse(result.data);
    expect(
      parsed.success ? null : parsed.error.issues,
      `${name} response matches the native contract`,
    ).toBeNull();
    return result;
  };
}

const adminApp = initializeAdminApp(
  { projectId: 'demo-paldora' },
  `flow-${randomUUID()}`,
);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const storage = getAdminStorage(adminApp).bucket(
  'demo-paldora.firebasestorage.app',
);
const moderationMaintenance = new NativeModeration(adminDb);
const boxDeletionMaintenance = new NativeBoxDeletion(adminDb);
const clientApps: ReturnType<typeof initializeApp>[] = [];

afterAll(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

async function client(username: string, verified = true, admitted = true) {
  const uid = randomUUID();
  const password = `Local-${randomUUID()}!`;
  const email = `${uid}@example.invalid`;
  await adminAuth.createUser({ uid, email, password, emailVerified: verified });
  if (admitted)
    await adminAuth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  const app = initializeApp(
    { projectId: 'demo-paldora', apiKey: 'demo-api-key', appId: `demo-${uid}` },
    `client-${uid}`,
  );
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'europe-west4');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, email, password);
  if (verified && admitted) {
    const provision = httpsCallable(functions, 'provisionMyAccount');
    await provision({});
    const reserve = httpsCallable<{ username: string }>(
      functions,
      'reserveUsername',
    );
    await reserve({ username });
  }
  return { uid, db, functions };
}

describe('local Firebase Box vertical flow', () => {
  it('retires private Storage bytes before completing Box deletion', async () => {
    const owner = await client(`media_${randomUUID().slice(0, 8)}`);
    const box = await new NativeBoxes(adminDb).create(owner.uid, 'Media Box');
    const path = `private/boxes/${box.id}/photo.webp`;
    await storage.file(path).save(Buffer.from('private fixture'));
    const asset = adminDb.collection('nativeMediaAssets').doc(randomUUID());
    await asset.set({ boxId: box.id, objectPaths: [path] });
    const erasure = new NativeBoxDeletion(adminDb, async (candidate) => {
      await storage.file(candidate).delete({ ignoreNotFound: true });
    });
    await erasure.start(box.id, owner.uid, 'Media Box');
    expect((await storage.file(path).exists())[0]).toBe(true);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await erasure.processOnce(box.id)) === 'complete') break;
    }
    expect((await erasure.status(box.id, owner.uid)).phase).toBe('complete');
    expect((await storage.file(path).exists())[0]).toBe(false);
    expect((await asset.get()).exists).toBe(false);
  }, 20_000);

  it('does not provision an unverified Auth user', async () => {
    const user = await client(`unverified_${randomUUID().slice(0, 8)}`, false);
    const provision = httpsCallable(user.functions, 'provisionMyAccount');
    await expect(provision({})).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });
    await expect(createBox(user.db, user.uid, 'Unverified')).rejects.toThrow();
    const unadmitted = await client(
      `unadmitted_${randomUUID().slice(0, 8)}`,
      true,
      false,
    );
    const unadmittedProvision = httpsCallable(
      unadmitted.functions,
      'provisionMyAccount',
    );
    await expect(unadmittedProvision({})).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });
  }, 20_000);

  it('requires Auth and grants Box reads only after invitation acceptance', async () => {
    const ownerName = `owner_${randomUUID().slice(0, 8)}`;
    const owner = await client(ownerName);
    const guestName = `guest_${randomUUID().slice(0, 8)}`;
    const guest = await client(guestName);
    const sendFriend = httpsCallable<
      { username: string },
      { requestId: string }
    >(owner.functions, 'sendFriendRequest');
    const friendId = (await sendFriend({ username: guestName })).data.requestId;
    const ownerFriends = httpsCallable<
      { status: 'pending' | 'sent' | 'accepted' },
      { items: Array<{ id: string; otherUid: string }> }
    >(owner.functions, 'listMyFriendships');
    expect((await ownerFriends({ status: 'sent' })).data.items).toMatchObject([
      { id: friendId, otherUid: guest.uid },
    ]);
    const listFriends = httpsCallable<
      { status: 'pending' | 'accepted' },
      { items: Array<{ id: string; otherUid: string }> }
    >(guest.functions, 'listMyFriendships');
    expect((await listFriends({ status: 'pending' })).data.items).toMatchObject(
      [{ id: friendId, otherUid: owner.uid }],
    );
    const acceptFriend = httpsCallable<{ requestId: string }>(
      guest.functions,
      'acceptFriendRequest',
    );
    await acceptFriend({ requestId: friendId });
    expect(
      (await listFriends({ status: 'accepted' })).data.items,
    ).toMatchObject([{ id: friendId, otherUid: owner.uid }]);
    await expect(
      getDoc(doc(guest.db, 'nativeFriendPairs', friendId)),
    ).rejects.toThrow();
    const boxId = randomUUID();
    await createBox(owner.db, owner.uid, 'Crew', boxId);
    const listMembers = httpsCallable<
      { boxId: string },
      { items: Array<{ uid: string; username: string; role: string }> }
    >(guest.functions, 'listBoxMembers');
    await expect(listMembers({ boxId })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    await expect(getBox(guest.db, boxId)).rejects.toThrow();
    const invite = httpsCallable<
      { boxId: string; username: string },
      { invitationId: string }
    >(owner.functions, 'inviteBox');
    const { data } = await invite({ boxId, username: guestName });
    const sentInvitations = httpsCallable<
      { boxId: string },
      {
        items: Array<{
          id: string;
          inviteeUid: string;
          inviteeUsername: string;
        }>;
      }
    >(owner.functions, 'listBoxInvitations');
    expect((await sentInvitations({ boxId })).data.items).toMatchObject([
      {
        id: data.invitationId,
        inviteeUid: guest.uid,
        inviteeUsername: guestName,
      },
    ]);
    await expect(getBox(guest.db, boxId)).rejects.toThrow();
    const prematurePost = httpsCallable<{ boxId: string; text: string }>(
      guest.functions,
      'createBoxPost',
    );
    await expect(
      prematurePost({ boxId, text: 'Too early' }),
    ).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    const list = httpsCallable<
      { cursor?: string },
      {
        items: Array<{ id: string; boxId: string; boxName: string }>;
        nextCursor: string | null;
      }
    >(guest.functions, 'listMyBoxInvitations');
    expect((await list({})).data.items).toMatchObject([
      {
        id: data.invitationId,
        boxId,
        boxName: 'Crew',
        inviterUid: owner.uid,
        expiresAt: expect.any(Number),
      },
    ]);
    const accept = httpsCallable<{ invitationId: string }, { boxId: string }>(
      guest.functions,
      'acceptBoxInvitation',
    );
    expect((await accept({ invitationId: data.invitationId })).data.boxId).toBe(
      boxId,
    );
    expect(await getBox(guest.db, boxId)).toMatchObject({
      id: boxId,
      ownerUid: owner.uid,
    });
    expect((await listMembers({ boxId })).data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uid: guest.uid,
          username: guestName,
          role: 'member',
        }),
        expect.objectContaining({
          uid: owner.uid,
          username: ownerName,
          role: 'owner',
        }),
      ]),
    );
    const createPost = httpsCallable<
      { boxId: string; text: string },
      { postId: string }
    >(guest.functions, 'createBoxPost');
    const postId = (await createPost({ boxId, text: 'Our first memory' })).data
      .postId;
    await expect(
      getDoc(doc(owner.db, 'nativeBoxes', boxId, 'posts', postId)),
    ).rejects.toThrow();
    const readPost = httpsCallable<
      { boxId: string; postId: string },
      { text: string }
    >(owner.functions, 'getBoxPost');
    expect((await readPost({ boxId, postId })).data.text).toBe(
      'Our first memory',
    );
    const listPosts = httpsCallable<
      { boxId: string },
      { items: Array<{ id: string }> }
    >(owner.functions, 'listBoxPosts');
    expect(
      (await listPosts({ boxId })).data.items.map((item) => item.id),
    ).toEqual([postId]);
    const ownerComment = httpsCallable<
      { boxId: string; postId: string; text: string; parentId?: string },
      { commentId: string }
    >(owner.functions, 'createBoxComment');
    const rootId = (await ownerComment({ boxId, postId, text: 'Lovely' })).data
      .commentId;
    await expect(
      getDoc(
        doc(
          guest.db,
          'nativeBoxes',
          boxId,
          'posts',
          postId,
          'comments',
          rootId,
        ),
      ),
    ).rejects.toThrow();
    const guestComment = httpsCallable<
      { boxId: string; postId: string; text: string; parentId?: string },
      { commentId: string }
    >(guest.functions, 'createBoxComment');
    const replyId = (
      await guestComment({ boxId, postId, text: 'Thanks', parentId: rootId })
    ).data.commentId;
    const nestedId = (
      await guestComment({
        boxId,
        postId,
        text: 'Another reply',
        parentId: replyId,
      })
    ).data.commentId;
    const listComments = httpsCallable<
      { boxId: string; postId: string },
      { items: Array<{ id: string; parentId: string | null }> }
    >(owner.functions, 'listBoxComments');
    expect((await listComments({ boxId, postId })).data.items).toMatchObject([
      { id: rootId, parentId: null },
      { id: replyId, parentId: rootId },
      { id: nestedId, parentId: rootId },
    ]);
    const editComment = httpsCallable<{
      boxId: string;
      postId: string;
      commentId: string;
      text: string;
    }>(guest.functions, 'editBoxComment');
    await editComment({ boxId, postId, commentId: replyId, text: 'Thank you' });
    const deleteComment = httpsCallable<{
      boxId: string;
      postId: string;
      commentId: string;
    }>(guest.functions, 'deleteBoxComment');
    await deleteComment({ boxId, postId, commentId: replyId });
    await expect(
      guestComment({ boxId, postId, text: 'Too late', parentId: replyId }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    expect(
      (await listComments({ boxId, postId })).data.items.map((item) => item.id),
    ).toEqual([rootId, nestedId]);
    const setReaction = httpsCallable<{
      boxId: string;
      postId: string;
      commentId?: string;
      kind: string | null;
    }>(owner.functions, 'setBoxReaction');
    await setReaction({ boxId, postId, kind: '❤️' });
    await expect(
      getDoc(
        doc(
          guest.db,
          'nativeBoxes',
          boxId,
          'posts',
          postId,
          'reactions',
          owner.uid,
        ),
      ),
    ).rejects.toThrow();
    await setReaction({ boxId, postId, kind: '❤️' });
    const listReactions = httpsCallable<
      { boxId: string; postId: string; commentId?: string },
      { items: Array<{ uid: string; kind: string }> }
    >(guest.functions, 'listBoxReactions');
    expect((await listReactions({ boxId, postId })).data.items).toEqual([
      { uid: owner.uid, kind: '❤️' },
    ]);
    await expect(
      setReaction({ boxId, postId, kind: 'not emoji' }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    const guestReaction = httpsCallable<{
      boxId: string;
      postId: string;
      commentId: string;
      kind: string | null;
    }>(guest.functions, 'setBoxReaction');
    await guestReaction({ boxId, postId, commentId: rootId, kind: '👍' });
    expect(
      (await listReactions({ boxId, postId, commentId: rootId })).data.items,
    ).toEqual([{ uid: guest.uid, kind: '👍' }]);
    await setReaction({ boxId, postId, kind: null });
    expect((await listReactions({ boxId, postId })).data.items).toEqual([]);
    const ownerCreatePost = httpsCallable<
      { boxId: string; text: string },
      { postId: string }
    >(owner.functions, 'createBoxPost');
    const ownPostId = (await ownerCreatePost({ boxId, text: 'Owner note' }))
      .data.postId;
    await guestComment({ boxId, postId: ownPostId, text: 'Guest note' });
    const ownComments = httpsCallable<
      { boxId: string; postId: string },
      { items: Array<{ authorUid: string }> }
    >(owner.functions, 'listBoxComments');
    expect(
      (await ownComments({ boxId, postId: ownPostId })).data.items,
    ).toHaveLength(1);
    const setBlock = httpsCallable<{ targetUid: string; blocked: boolean }>(
      owner.functions,
      'setUserBlock',
    );
    await expect(
      setBlock({ targetUid: owner.uid, blocked: true }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
    await setBlock({ targetUid: guest.uid, blocked: true });
    expect((await listFriends({ status: 'accepted' })).data.items).toEqual([]);
    expect((await listMembers({ boxId })).data.items).toEqual([
      expect.objectContaining({
        uid: guest.uid,
        username: guestName,
        role: 'member',
      }),
    ]);
    await expect(readPost({ boxId, postId })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    expect(
      (await listPosts({ boxId })).data.items.map((item) => item.id),
    ).toEqual([ownPostId]);
    expect(
      (await ownComments({ boxId, postId: ownPostId })).data.items,
    ).toEqual([]);
    await setBlock({ targetUid: guest.uid, blocked: false });
    expect((await ownerFriends({ status: 'accepted' })).data.items).toEqual([]);
    await expect(acceptFriend({ requestId: friendId })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    await sendFriend({ username: guestName });
    expect((await listFriends({ status: 'pending' })).data.items).toHaveLength(
      1,
    );
    const closeFriend = httpsCallable<{ requestId: string }>(
      guest.functions,
      'closeFriendship',
    );
    await closeFriend({ requestId: friendId });
    expect((await listFriends({ status: 'pending' })).data.items).toEqual([]);
    const editPost = httpsCallable<{
      boxId: string;
      postId: string;
      text: string;
    }>(guest.functions, 'editBoxPost');
    await editPost({ boxId, postId, text: 'Edited memory' });
    expect((await readPost({ boxId, postId })).data.text).toBe('Edited memory');
    const deletePost = httpsCallable<{ boxId: string; postId: string }>(
      guest.functions,
      'deleteBoxPost',
    );
    await deletePost({ boxId, postId });
    await expect(readPost({ boxId, postId })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    const reportPostId = (await createPost({ boxId, text: 'Reportable text' }))
      .data.postId;
    const reportPost = httpsCallable<
      { boxId: string; postId: string; reason: string },
      { reportId: string }
    >(owner.functions, 'reportBoxPost');
    const reportId = (
      await reportPost({ boxId, postId: reportPostId, reason: 'Test report' })
    ).data.reportId;
    await expect(
      getDoc(doc(guest.db, 'nativeReports', reportId)),
    ).rejects.toThrow();
    const guestReports = httpsCallable(
      guest.functions,
      'listModerationReports',
    );
    await expect(guestReports({})).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    await adminDb
      .collection('nativeStaffGrants')
      .doc(owner.uid)
      .set({ status: 'active' });
    const staffReports = httpsCallable<
      Record<string, never>,
      { items: Array<{ id: string; reporterUid: string }> }
    >(owner.functions, 'listModerationReports');
    expect((await staffReports({})).data.items).toMatchObject([
      { id: reportId, reporterUid: owner.uid },
    ]);
    const hidePost = httpsCallable<{ reportId: string }>(
      owner.functions,
      'hideReportedPost',
    );
    await hidePost({ reportId });
    await expect(
      readPost({ boxId, postId: reportPostId }),
    ).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    expect((await staffReports({})).data.items).toEqual([]);
    expect(
      (await adminDb.collection('nativeModerationAudit').get()).docs.map(
        (item) => item.get('reportId'),
      ),
    ).toContain(reportId);
    const closedAt = (
      await adminDb.collection('nativeReports').doc(reportId).get()
    ).get('closedAt') as number;
    expect(
      await moderationMaintenance.redactClosedReports(
        closedAt + 89 * 24 * 60 * 60 * 1_000,
      ),
    ).toBe(0);
    expect(
      await moderationMaintenance.redactClosedReports(
        closedAt + 91 * 24 * 60 * 60 * 1_000,
      ),
    ).toBe(1);
    expect(
      (await adminDb.collection('nativeReports').doc(reportId).get()).data(),
    ).not.toHaveProperty('reporterUid');
    expect(
      (await adminDb.collection('nativeReports').doc(reportId).get()).data(),
    ).not.toHaveProperty('reason');
    expect((await list({})).data.items).toEqual([]);
    const ownerList = httpsCallable(owner.functions, 'listMyBoxInvitations');
    expect((await ownerList({})).data).toMatchObject({ items: [] });
    const guestInvite = httpsCallable<{ boxId: string; username: string }>(
      guest.functions,
      'inviteBox',
    );
    await expect(
      guestInvite({ boxId, username: ownerName }),
    ).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    const anonymousApp = initializeApp(
      {
        projectId: 'demo-paldora',
        apiKey: 'demo-api-key',
        appId: 'demo-anonymous',
      },
      `anonymous-${randomUUID()}`,
    );
    clientApps.push(anonymousApp);
    const anonymousFunctions = getFunctions(anonymousApp, 'europe-west4');
    connectFunctionsEmulator(anonymousFunctions, '127.0.0.1', 5001);
    const anonymousInvite = httpsCallable<{ boxId: string; username: string }>(
      anonymousFunctions,
      'inviteBox',
    );
    await expect(
      anonymousInvite({ boxId, username: guestName }),
    ).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
    // An unsigned call is stopped by the platform before any reason is added.
  }, 45_000);

  it('starts Box deletion through an Auth-bound callable and resumes cleanup', async () => {
    const owner = await client(`delete_${randomUUID().slice(0, 8)}`);
    const outsider = await client(`outsider_${randomUUID().slice(0, 8)}`);
    const boxId = randomUUID();
    await createBox(owner.db, owner.uid, 'Doomed', boxId);
    const begin = httpsCallable<
      { boxId: string; confirmName: string },
      { jobId: string }
    >(owner.functions, 'beginBoxDeletion');
    const outsiderBegin = httpsCallable<{ boxId: string; confirmName: string }>(
      outsider.functions,
      'beginBoxDeletion',
    );
    await expect(
      outsiderBegin({ boxId, confirmName: 'Doomed' }),
    ).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    await expect(begin({ boxId, confirmName: 'doomed' })).rejects.toMatchObject(
      {
        code: 'functions/invalid-argument',
      },
    );
    expect((await begin({ boxId, confirmName: 'Doomed' })).data.jobId).toBe(
      `box-delete-${boxId}`,
    );
    await expect(getBox(owner.db, boxId)).rejects.toThrow();
    const finish = async (remaining: number): Promise<void> => {
      if (remaining === 0) throw new Error('Box cleanup did not converge');
      if ((await boxDeletionMaintenance.processOnce(boxId)) === 'complete')
        return;
      await finish(remaining - 1);
    };
    await finish(10);
    const status = httpsCallable<{ boxId: string }, { phase: string }>(
      owner.functions,
      'boxDeletionStatus',
    );
    expect((await status({ boxId })).data.phase).toBe('complete');
    expect(
      (await adminDb.collection('nativeBoxes').doc(boxId).get()).exists,
    ).toBe(false);
  }, 30_000);

  it('keeps callable Life Updates private and scopes Box deliveries', async () => {
    const owner = await client(`update_${randomUUID().slice(0, 8)}`);
    const outsider = await client(`reader_${randomUUID().slice(0, 8)}`);
    const boxId = randomUUID();
    await createBox(owner.db, owner.uid, 'Journal', boxId);
    const create = httpsCallable<
      {
        audience: { type: 'boxes'; boxIds: string[] };
        sections: { travel: string };
      },
      { id: string }
    >(owner.functions, 'createLifeUpdate');
    const id = (
      await create({
        audience: { type: 'boxes', boxIds: [boxId] },
        sections: { travel: 'A trip' },
      })
    ).data.id;
    const read = httpsCallable<
      { id: string },
      { contexts: Array<{ boxId: string }> }
    >(owner.functions, 'getLifeUpdate');
    const outsiderRead = httpsCallable<{ id: string }>(
      outsider.functions,
      'getLifeUpdate',
    );
    expect((await read({ id })).data.contexts).toMatchObject([{ boxId }]);
    await expect(outsiderRead({ id })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    await expect(
      getDoc(doc(owner.db, 'nativeLifeUpdates', id)),
    ).rejects.toThrow();
    const listMine = httpsCallable<
      { cursor?: string },
      {
        items: Array<{ id: string; contexts: Array<{ boxId: string }> }>;
        nextCursor: string | null;
      }
    >(owner.functions, 'listMyLifeUpdates');
    const mine = (await listMine({})).data;
    expect(mine.items).toMatchObject([{ id, contexts: [{ boxId }] }]);
    expect(mine.nextCursor).toBeNull();
    expect((await listMine({ cursor: id })).data.items).toEqual([]);
    expect(
      (
        await httpsCallable<object, { items: unknown[] }>(
          outsider.functions,
          'listMyLifeUpdates',
        )({})
      ).data.items,
    ).toEqual([]);
    const edit = httpsCallable<{
      id: string;
      changes: { sections: { reading: string } };
    }>(owner.functions, 'editLifeUpdate');
    await edit({ id, changes: { sections: { reading: 'A book' } } });
    const remove = httpsCallable<{ id: string }>(
      owner.functions,
      'deleteLifeUpdate',
    );
    await remove({ id });
    await expect(read({ id })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    expect((await listMine({})).data.items).toEqual([]);
  }, 30_000);

  it('refuses an ID token whose session epoch was rotated (ADR 021 #5)', async () => {
    async function epochClient(tokenEpoch: string, accountEpoch: string) {
      const uid = randomUUID();
      const password = `Local-${randomUUID()}!`;
      const email = `${uid}@example.invalid`;
      await adminAuth.createUser({ uid, email, password, emailVerified: true });
      await adminAuth.setCustomUserClaims(uid, {
        paldoraAdmitted: true,
        paldoraSessionEpoch: tokenEpoch,
      });
      await adminDb
        .collection('nativeAccounts')
        .doc(uid)
        .set({ status: 'active', sessionEpoch: accountEpoch });
      const app = initializeApp(
        {
          projectId: 'demo-paldora',
          apiKey: 'demo-api-key',
          appId: `demo-${uid}`,
        },
        `epoch-${uid}`,
      );
      clientApps.push(app);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
      const functions = getFunctions(app, 'europe-west4');
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      await signInWithEmailAndPassword(auth, email, password);
      return httpsCallable<object, { items: unknown[] }>(
        functions,
        'listMyLifeUpdates',
      );
    }
    const current = await epochClient('epoch-a', 'epoch-a');
    expect((await current({})).data.items).toEqual([]);
    const stale = await epochClient('epoch-old', 'epoch-new');
    await expect(stale({})).rejects.toMatchObject({
      code: 'functions/unauthenticated',
      details: { reason: 'SESSION_ENDED' },
    });
  }, 30_000);

  it('lets invitees decline and Box owners revoke pending invitations', async () => {
    const owner = await client(`inviter_${randomUUID().slice(0, 8)}`);
    const declineName = `decline_${randomUUID().slice(0, 8)}`;
    const decliner = await client(declineName);
    const revokeName = `revoke_${randomUUID().slice(0, 8)}`;
    const revokee = await client(revokeName);
    const boxId = randomUUID();
    await createBox(owner.db, owner.uid, 'Gate', boxId);
    const invite = httpsCallable<
      { boxId: string; username: string },
      { invitationId: string }
    >(owner.functions, 'inviteBox');
    const declined = (await invite({ boxId, username: declineName })).data
      .invitationId;
    const revoked = (await invite({ boxId, username: revokeName })).data
      .invitationId;
    const pending = httpsCallable<object, { items: Array<{ id: string }> }>(
      decliner.functions,
      'listMyBoxInvitations',
    );
    expect((await pending({})).data.items).toMatchObject([{ id: declined }]);

    const decline = httpsCallable<{ invitationId: string }>(
      decliner.functions,
      'declineBoxInvitation',
    );
    await expect(
      httpsCallable<{ invitationId: string }>(
        revokee.functions,
        'declineBoxInvitation',
      )({ invitationId: declined }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await decline({ invitationId: declined });
    expect((await pending({})).data.items).toEqual([]);
    await expect(decline({ invitationId: declined })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
    await expect(
      httpsCallable<{ invitationId: string }>(
        decliner.functions,
        'acceptBoxInvitation',
      )({ invitationId: declined }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(getBox(decliner.db, boxId)).rejects.toThrow();

    const revoke = httpsCallable<{ invitationId: string; boxId: string }>(
      owner.functions,
      'revokeBoxInvitation',
    );
    await expect(
      httpsCallable<{ invitationId: string; boxId: string }>(
        decliner.functions,
        'revokeBoxInvitation',
      )({ invitationId: revoked, boxId }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await revoke({ invitationId: revoked, boxId });
    const sent = httpsCallable<
      { boxId: string },
      { items: Array<{ id: string }> }
    >(owner.functions, 'listBoxInvitations');
    expect(
      (await sent({ boxId })).data.items.map((item) => item.id),
    ).not.toContain(revoked);
    expect(
      (
        await httpsCallable<object, { items: unknown[] }>(
          revokee.functions,
          'listMyBoxInvitations',
        )({})
      ).data.items,
    ).toEqual([]);
    await expect(
      revoke({ invitationId: revoked, boxId }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(
      httpsCallable<{ invitationId: string }>(
        revokee.functions,
        'acceptBoxInvitation',
      )({ invitationId: revoked }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(getBox(revokee.db, boxId)).rejects.toThrow();
  }, 45_000);

  it('serves profile, Boxes, notifications and Home feed to a native client', async () => {
    type Fn = Functions;
    const call = <Response = Record<string, unknown>>(
      functions: Fn,
      name: string,
    ) => httpsCallable<Record<string, unknown>, Response>(functions, name);
    type Page<T> = { items: T[]; nextCursor: string | null };
    const alice = await client(`alice_${randomUUID().slice(0, 8)}`);
    const bobName = `bob_${randomUUID().slice(0, 8)}`;
    const bob = await client(bobName);
    const eve = await client(`eve_${randomUUID().slice(0, 8)}`);

    // Profile and preferences.
    const me = await call<{
      user: { id: string };
      profile: { displayName: string | null; bio: string | null };
      preferences: { appearance: string; reactionPresets: string[] };
    }>(
      alice.functions,
      'getMyProfile',
    )({});
    expect(me.data.user.id).toBe(alice.uid);
    expect(me.data.preferences.reactionPresets).toHaveLength(5);
    const updated = await call<{
      profile: { displayName: string; bio: string };
    }>(
      alice.functions,
      'updateMyProfile',
    )({ displayName: 'Alice A', bio: 'Hello' });
    expect(updated.data.profile).toMatchObject({
      displayName: 'Alice A',
      bio: 'Hello',
    });
    await expect(
      call(alice.functions, 'updateMyProfile')({ displayName: '' }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    await expect(
      call(alice.functions, 'updateMyProfile')({}),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const prefs = await call<{ appearance: string }>(
      alice.functions,
      'updateMyPreferences',
    )({ appearance: 'dark' });
    expect(prefs.data.appearance).toBe('dark');
    await expect(
      call(alice.functions, 'updateMyPreferences')({ reactionPresets: ['x'] }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    expect(
      (
        await call<{ profile: { displayName: string | null } }>(
          bob.functions,
          'getMyProfile',
        )({})
      ).data.profile.displayName,
    ).not.toBe('Alice A');

    // Boxes: owner-scoped listing, guessed ids are not-found.
    const created = await call<{ id: string; currentUserRole: string }>(
      alice.functions,
      'createBox',
    )({ name: 'Native Crew' });
    expect(created.data.currentUserRole).toBe('owner');
    const boxId = created.data.id;
    await expect(
      call(alice.functions, 'createBox')({ name: '   ' }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const listBoxes = (f: Fn) =>
      call<Page<{ id: string }>>(f, 'listMyBoxes')({});
    expect(
      (await listBoxes(alice.functions)).data.items.map((b) => b.id),
    ).toEqual([boxId]);
    expect((await listBoxes(eve.functions)).data.items).toEqual([]);
    await expect(
      call(alice.functions, 'listMyBoxes')({ cursor: 'not-a-box' }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    for (const outsider of [eve, bob])
      await expect(
        call(outsider.functions, 'getBox')({ boxId }),
      ).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(
      call(alice.functions, 'getBox')({ boxId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });

    const invited = await call<{ invitationId: string }>(
      alice.functions,
      'inviteBox',
    )({ boxId, username: bobName });
    await call(
      bob.functions,
      'acceptBoxInvitation',
    )({
      invitationId: invited.data.invitationId,
    });
    expect(
      (await call<{ memberCount: number }>(bob.functions, 'getBox')({ boxId }))
        .data.memberCount,
    ).toBe(2);

    // Home feed: members only, with interaction summaries and Life Updates.
    const post = await call<{ postId: string }>(
      bob.functions,
      'createBoxPost',
    )({ boxId, text: 'From Bob' });
    await call(
      bob.functions,
      'createLifeUpdate',
    )({
      audience: { type: 'boxes', boxIds: [boxId] },
      sections: { travel: 'Bob went somewhere' },
    });
    type FeedItem = {
      kind: string;
      id: string;
      authorUid: string;
      interactions: { commentCount: number; canInteract: boolean };
      sections?: { key: string }[];
      text?: string;
    };
    const feed = (f: Fn, cursor?: string) =>
      call<Page<FeedItem>>(f, 'getHomeFeed')(cursor ? { cursor } : {});
    const aliceFeed = (await feed(alice.functions)).data;
    expect(aliceFeed.items.map((item) => item.kind).sort()).toEqual([
      'life_update',
      'post',
    ]);
    expect(aliceFeed.items.find((i) => i.kind === 'post')).toMatchObject({
      id: post.data.postId,
      authorUid: bob.uid,
      text: 'From Bob',
      canEdit: false,
      interactions: { commentCount: 0, canInteract: true },
    });
    expect(
      aliceFeed.items.find((i) => i.kind === 'life_update')?.sections,
    ).toEqual([{ key: 'travel', content: 'Bob went somewhere' }]);
    expect((await feed(eve.functions)).data).toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(feed(alice.functions, 'garbage')).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });

    // Notifications: pointers only; every read rechecks live visibility.
    const commentOn = (f: Fn, text: string) =>
      call(f, 'createBoxComment')({ boxId, postId: post.data.postId, text });
    await commentOn(alice.functions, 'Nice one');
    type Note = {
      id: string;
      actor: { uid: string };
      boxName: string;
      read: boolean;
    };
    const notes = (f: Fn) =>
      call<Page<Note> & { unreadCount: { count: number } }>(
        f,
        'listMyNotifications',
      )({});
    const unread = (f: Fn) =>
      call<{ count: number }>(f, 'countMyUnreadNotifications')({});
    const bobNotes = (await notes(bob.functions)).data;
    expect(bobNotes.items).toMatchObject([
      { actor: { uid: alice.uid }, boxName: 'Native Crew', read: false },
    ]);
    expect(bobNotes.unreadCount.count).toBe(1);
    expect((await unread(bob.functions)).data.count).toBe(1);
    const noteId = bobNotes.items[0]!.id;
    for (const outsider of [eve, alice])
      await expect(
        call(outsider.functions, 'markNotificationRead')({ id: noteId }),
      ).rejects.toMatchObject({ code: 'functions/not-found' });
    expect((await notes(eve.functions)).data.items).toEqual([]);
    expect((await unread(eve.functions)).data.count).toBe(0);
    expect(
      (await call<Note>(bob.functions, 'markNotificationRead')({ id: noteId }))
        .data.read,
    ).toBe(true);
    expect((await unread(bob.functions)).data.count).toBe(0);
    await commentOn(alice.functions, 'Another');
    expect((await unread(bob.functions)).data.count).toBe(1);
    await call(bob.functions, 'markAllNotificationsRead')({});
    expect((await unread(bob.functions)).data.count).toBe(0);
    await expect(
      call(bob.functions, 'listMyNotifications')({ cursor: 'missing' }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });

    // A block hides the blocked author's notifications and feed items.
    await commentOn(alice.functions, 'Third');
    expect((await unread(bob.functions)).data.count).toBe(1);
    await call(
      bob.functions,
      'setUserBlock',
    )({
      targetUid: alice.uid,
      blocked: true,
    });
    expect((await unread(bob.functions)).data.count).toBe(0);
    expect((await notes(bob.functions)).data.items).toEqual([]);
    await expect(
      call(bob.functions, 'markNotificationRead')({ id: noteId }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await call(alice.functions, 'createBoxPost')({ boxId, text: 'From Alice' });
    expect(
      (await feed(bob.functions)).data.items.filter(
        (item) => item.authorUid === alice.uid,
      ),
    ).toEqual([]);
  }, 60_000);
});

describe('native contract coverage of this flow', () => {
  it('exercises every native callable', () => {
    const missing = [...registry.keys()].filter((name) => !exercised.has(name));
    process.stdout.write(
      `native-contract: ${exercised.size}/${registry.size} callables exercised; not exercised: ${missing.join(', ')}\n`,
    );
    expect(missing).toEqual([]);
  });
});
