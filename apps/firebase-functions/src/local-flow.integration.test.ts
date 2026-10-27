import { randomUUID } from 'node:crypto';
import {
  NativeBoxDeletion,
  NativeBoxes,
  NativeMedia,
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
  return { uid, db, functions, auth, email, password };
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
      profile: {
        displayName: string | null;
        bio: string | null;
        avatarMediaId: string | null;
      };
      preferences: { appearance: string; reactionPresets: string[] };
    }>(
      alice.functions,
      'getMyProfile',
    )({});
    expect(me.data.user.id).toBe(alice.uid);
    expect(me.data.profile.avatarMediaId).toBeNull();
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

describe('native private media over callables and authenticated HTTP', () => {
  // A real 1x1 PNG; Sharp decodes it, so the processing path is the real one.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const base = 'http://127.0.0.1:5001/demo-paldora/europe-west4';
  const mediaMaintenance = new NativeMedia(
    adminDb,
    getAdminStorage(adminApp),
    'demo-paldora.firebasestorage.app',
  );
  type Client = Awaited<ReturnType<typeof client>>;
  const tokenOf = (user: Client) => user.auth.currentUser!.getIdToken();
  const put = (
    id: string,
    token: string | null,
    body: Buffer,
    contentType = 'image/png',
  ) =>
    fetch(`${base}/mediaUpload/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: new Uint8Array(body),
    });
  const get = (id: string, variant: string, token: string | null) =>
    fetch(`${base}/mediaRead/${id}/${variant}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  type Asset = { id: string; status: string };
  const reserve = (
    user: Client,
    request: Record<string, unknown>,
  ): Promise<{
    data: { mediaAsset: Asset; upload: { path: string; method: string } };
  }> =>
    httpsCallable<Record<string, unknown>, never>(
      user.functions,
      'createMediaUpload',
    )(request) as never;
  const assetStatus = async (user: Client, assetId: string) =>
    (
      await httpsCallable<
        { assetId: string },
        { status: string; available: boolean; width: number | null }
      >(
        user.functions,
        'getMediaAsset',
      )({ assetId })
    ).data;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  async function waitReady(user: Client, id: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const details = await assetStatus(user, id);
      if (details.status === 'ready') return details;
      await sleep(250);
    }
    throw new Error('media never became ready');
  }

  async function readyAsset(
    user: Client,
    request: Record<string, unknown>,
  ): Promise<string> {
    const { data } = await reserve(user, request);
    const id = data.mediaAsset.id;
    expect(data.upload).toMatchObject({ method: 'PUT', path: `/${id}` });
    const uploaded = await put(id, await tokenOf(user), png);
    expect(uploaded.status).toBe(204);
    await httpsCallable<{ assetId: string }, Asset>(
      user.functions,
      'completeMediaUpload',
    )({ assetId: id });
    // The Firestore trigger may already be processing; the lease makes this safe.
    await mediaMaintenance.processOnce(`media-process-${id}-0`);
    await waitReady(user, id);
    return id;
  }

  it('reserves, uploads, processes and serves a photo with live authorization', async () => {
    const call = <Response = Record<string, unknown>>(
      user: Client,
      name: string,
    ) => httpsCallable<Record<string, unknown>, Response>(user.functions, name);
    const bobName = `bob_${randomUUID().slice(0, 8)}`;
    const carolName = `carol_${randomUUID().slice(0, 8)}`;
    const alice = await client(`alice_${randomUUID().slice(0, 8)}`);
    const bob = await client(bobName);
    const carol = await client(carolName);
    const eve = await client(`eve_${randomUUID().slice(0, 8)}`);
    const boxId = (
      await call<{ id: string }>(alice, 'createBox')({ name: 'Media Crew' })
    ).data.id;
    for (const [user, name] of [
      [bob, bobName],
      [carol, carolName],
    ] as const) {
      const invite = await call<{ invitationId: string }>(
        alice,
        'inviteBox',
      )({ boxId, username: name });
      await call(
        user,
        'acceptBoxInvitation',
      )({
        invitationId: invite.data.invitationId,
      });
    }

    // A non-member cannot reserve a Box photo; validation matches the web.
    await expect(
      reserve(eve, {
        purpose: 'post_image',
        boxId,
        contentType: 'image/png',
        contentLength: png.length,
      }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(
      reserve(bob, {
        purpose: 'post_image',
        contentType: 'image/png',
        contentLength: png.length,
      }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    await expect(
      reserve(bob, {
        purpose: 'avatar',
        contentType: 'image/gif',
        contentLength: 10,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });

    // Reserve, then exercise rejection paths before any valid upload.
    const { data: reservation } = await reserve(bob, {
      purpose: 'post_image',
      boxId,
      contentType: 'image/png',
      contentLength: png.length,
    });
    const id = reservation.mediaAsset.id;
    const bobToken = await tokenOf(bob);
    expect((await put(id, null, png)).status).toBe(401);
    expect((await put(id, 'not-a-token', png)).status).toBe(401);
    expect((await put(id, await tokenOf(eve), png)).status).toBe(404);
    expect((await put(id, bobToken, png, 'image/jpeg')).status).toBe(400);
    expect(
      (await put(id, bobToken, Buffer.concat([png, Buffer.from([0])]))).status,
    ).toBe(400);
    const oversize = await put(
      id,
      bobToken,
      Buffer.alloc(10 * 1024 * 1024 + 1),
    );
    expect(oversize.status).toBe(413);
    // Read before the bytes arrive: not found, for the owner too.
    expect((await get(id, 'display', bobToken)).status).toBe(404);
    expect((await assetStatus(bob, id)).status).toBe('pending');

    // Valid upload; the same asset cannot be written twice.
    expect((await put(id, bobToken, png)).status).toBe(204);
    expect((await put(id, bobToken, png)).status).toBe(404);
    // Complete is owner-only and idempotent.
    await expect(
      call(eve, 'completeMediaUpload')({ assetId: id }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    await call(bob, 'completeMediaUpload')({ assetId: id });
    await call(bob, 'completeMediaUpload')({ assetId: id });
    await mediaMaintenance.processOnce(`media-process-${id}-0`);
    const ready = await waitReady(bob, id);
    expect(ready).toMatchObject({ status: 'ready', available: true, width: 1 });
    await expect(
      call(eve, 'getMediaAsset')({ assetId: id }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });

    // Ready but unattached: only the owner may read it.
    expect((await get(id, 'display', bobToken)).status).toBe(200);
    expect((await get(id, 'display', await tokenOf(alice))).status).toBe(404);

    // Attach to a post: Box members can read, others cannot.
    const created = await call<{ postId: string }>(
      bob,
      'createBoxPost',
    )({ boxId, text: '', mediaAssetIds: [id] });
    await expect(
      call(bob, 'createBoxPost')({ boxId, text: 'again', mediaAssetIds: [id] }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(
      call(bob, 'createBoxPost')({ boxId, text: '', mediaAssetIds: [] }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const aliceToken = await tokenOf(alice);
    for (const [token, variant] of [
      [bobToken, 'display'],
      [aliceToken, 'display'],
      [aliceToken, 'thumbnail'],
    ] as const) {
      const response = await get(id, variant, token);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      expect(response.headers.get('cache-control')).toBe('private, no-store');

      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    }
    expect(
      (
        await call<{ mediaAssetIds: string[] }>(
          alice,
          'getBoxPost',
        )({ boxId, postId: created.data.postId })
      ).data.mediaAssetIds,
    ).toEqual([id]);

    // Absence and denial are the same 404 with the same body.
    const denied = await get(id, 'display', await tokenOf(eve));
    const absent = await get(randomUUID(), 'display', await tokenOf(eve));
    const master = await get(id, 'master', aliceToken);
    const malformed = await get('not-a-uuid', 'display', aliceToken);
    for (const response of [denied, absent, master, malformed])
      expect(response.status).toBe(404);
    const bodies = await Promise.all(
      [denied, absent, master, malformed].map((r) => r.text()),
    );
    expect(new Set(bodies).size).toBe(1);
    expect((await get(id, 'display', null)).status).toBe(401);
    expect((await get(id, 'display', 'garbage')).status).toBe(401);
    expect(
      (await fetch(`${base}/mediaRead/${id}/display`, { method: 'POST' }))
        .status,
    ).toBe(405);

    // A block overrides Box membership on the very next read.
    const carolToken = await tokenOf(carol);
    expect((await get(id, 'thumbnail', carolToken)).status).toBe(200);
    await call(bob, 'setUserBlock')({ targetUid: carol.uid, blocked: true });
    expect((await get(id, 'thumbnail', carolToken)).status).toBe(404);
    expect((await get(id, 'thumbnail', bobToken)).status).toBe(200);
    // The blocker sees the block in their own list only.
    const blockedList = await call<{ items: { userId: string }[] }>(
      bob,
      'listMyBlocks',
    )({});
    expect(blockedList.data.items.map((item) => item.userId)).toContain(
      carol.uid,
    );
    const theirList = await call<{ items: unknown[] }>(
      carol,
      'listMyBlocks',
    )({});
    expect(theirList.data.items).toEqual([]);

    // Deleting the post closes reads for members.
    await call(bob, 'deleteBoxPost')({ boxId, postId: created.data.postId });
    expect((await get(id, 'display', aliceToken)).status).toBe(404);
  }, 90_000);

  it('serves avatars and life update photos, and refuses a stale session epoch', async () => {
    const owner = await client(`owner_${randomUUID().slice(0, 8)}`);
    const avatar = await readyAsset(owner, {
      purpose: 'avatar',
      contentType: 'image/png',
      contentLength: png.length,
    });
    expect((await get(avatar, 'thumbnail', await tokenOf(owner))).status).toBe(
      200,
    );
    // The profile exposes the avatar as an opaque id only.
    const profile = await httpsCallable<
      unknown,
      { profile: { avatarMediaId: string | null } }
    >(
      owner.functions,
      'getMyProfile',
    )({});
    expect(profile.data.profile.avatarMediaId).toBe(avatar);
    // Removing the avatar clears the profile and retires the bytes.
    const removeAvatar = httpsCallable<unknown, { ok: true }>(
      owner.functions,
      'deleteAvatar',
    );
    expect((await removeAvatar({})).data).toEqual({ ok: true });
    const cleared = await httpsCallable<
      unknown,
      { profile: { avatarMediaId: string | null } }
    >(
      owner.functions,
      'getMyProfile',
    )({});
    expect(cleared.data.profile.avatarMediaId).toBeNull();
    expect((await get(avatar, 'thumbnail', await tokenOf(owner))).status).toBe(
      404,
    );
    // Idempotent: nothing left to remove is still a success.
    expect((await removeAvatar({})).data).toEqual({ ok: true });
    const photo = await readyAsset(owner, {
      purpose: 'life_update_image',
      contentType: 'image/png',
      contentLength: png.length,
    });
    await httpsCallable(
      owner.functions,
      'createLifeUpdate',
    )({
      audience: { type: 'only_me' },
      sections: { travel: 'With a photo' },
      mediaAssetIds: [photo],
    });
    expect((await get(photo, 'display', await tokenOf(owner))).status).toBe(
      200,
    );

    // A token minted under an older session epoch is refused, like a callable.
    const uid = randomUUID();
    const password = `Local-${randomUUID()}!`;
    const email = `${uid}@example.invalid`;
    await adminAuth.createUser({ uid, email, password, emailVerified: true });
    await adminAuth.setCustomUserClaims(uid, {
      paldoraAdmitted: true,
      paldoraSessionEpoch: 'epoch-old',
    });
    await adminDb
      .collection('nativeAccounts')
      .doc(uid)
      .set({ status: 'active', sessionEpoch: 'epoch-new' });
    const app = initializeApp(
      {
        projectId: 'demo-paldora',
        apiKey: 'demo-api-key',
        appId: `demo-${uid}`,
      },
      `media-epoch-${uid}`,
    );
    clientApps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    await signInWithEmailAndPassword(auth, email, password);
    const stale = await auth.currentUser!.getIdToken();
    expect((await get(photo, 'display', stale)).status).toBe(401);
    expect((await put(photo, stale, png)).status).toBe(401);
  }, 60_000);

  it('serves Rooms and Memories with live privacy, stale-write detection and opaque cursors', async () => {
    const call = <Response = Record<string, unknown>>(
      user: Client,
      name: string,
    ) => httpsCallable<Record<string, unknown>, Response>(user.functions, name);
    type Page<T> = { items: T[]; nextCursor: string | null };
    type Room = {
      owner: { uid: string; username: string; avatarMediaId: string | null };
      relationship: string;
      style: { themePreset: string };
      location: string | null;
      music: { url: string } | null;
      bannerMediaId: string | null;
      widgets: { type: string; position: number; enabled: boolean }[];
      topFriends: {
        size: number | null;
        items: { uid: string }[] | null;
      };
      visibility: string | null;
      updatedAt: number | null;
    };
    type Memory = { kind: string; id: string; authorUid: string };
    const names = {
      alice: `alice_${randomUUID().slice(0, 8)}`,
      bob: `bob_${randomUUID().slice(0, 8)}`,
      carol: `carol_${randomUUID().slice(0, 8)}`,
    };
    const alice = await client(names.alice);
    const bob = await client(names.bob);
    const carol = await client(names.carol);
    const dave = await client(`dave_${randomUUID().slice(0, 8)}`);
    const boxId = (
      await call<{ id: string }>(alice, 'createBox')({ name: 'Rooms Crew' })
    ).data.id;
    for (const [user, name] of [
      [bob, names.bob],
      [carol, names.carol],
    ] as const) {
      const invite = await call<{ invitationId: string }>(
        alice,
        'inviteBox',
      )({ boxId, username: name });
      await call(
        user,
        'acceptBoxInvitation',
      )({
        invitationId: invite.data.invitationId,
      });
    }
    const request = await call<{ requestId: string }>(
      alice,
      'sendFriendRequest',
    )({ username: names.bob });
    await call(
      bob,
      'acceptFriendRequest',
    )({
      requestId: request.data.requestId,
    });

    const myRoom = (user: Client) => call<Room>(user, 'getMyRoom')({});
    const roomOf = (user: Client, username: string) =>
      call<Room>(user, 'getRoom')({ username });
    const update = (user: Client, changes: Record<string, unknown>) =>
      call<Room>(user, 'updateMyRoom')(changes);

    // A never-saved Room: defaults, owner-only fields, no banner.
    const fresh = (await myRoom(alice)).data;
    expect(fresh).toMatchObject({
      relationship: 'owner',
      bannerMediaId: null,
      updatedAt: null,
      topFriends: { items: [] },
    });
    expect(fresh.widgets).toHaveLength(7);

    // Writes: validation, then optimistic concurrency with a reasoned error.
    for (const bad of [
      { sparkles: true },
      { sparkles: true, expectedUpdatedAt: '2026-10-27T00:00:00.000Z' },
      { sparkles: true, expectedUpdatedAt: -1 },
      { css: 'body{}', sparkles: true, expectedUpdatedAt: null },
      { expectedUpdatedAt: null },
      {
        music: { url: 'http://music.example.com/x' },
        expectedUpdatedAt: null,
      },
      { themePreset: 'not_a_theme', expectedUpdatedAt: null },
    ])
      await expect(update(alice, bad)).rejects.toMatchObject({
        code: 'functions/invalid-argument',
        details: { reason: 'INVALID_INPUT' },
      });
    const first = (
      await update(alice, {
        themePreset: 'polaroid_scrapbook',
        location: 'Lisbon',
        music: { url: 'https://music.example.com/track', title: 'Song' },
        expectedUpdatedAt: null,
      })
    ).data;
    expect(first).toMatchObject({
      style: { themePreset: 'polaroid_scrapbook' },
      location: 'Lisbon',
      music: { url: 'https://music.example.com/track' },
    });
    expect(first.updatedAt).toEqual(expect.any(Number));
    await expect(
      update(alice, { location: 'Porto', expectedUpdatedAt: null }),
    ).rejects.toMatchObject({
      code: 'functions/failed-precondition',
      details: { reason: 'STALE_WRITE' },
    });
    const second = (
      await update(alice, {
        location: 'Porto',
        expectedUpdatedAt: first.updatedAt,
      })
    ).data;
    expect(second.location).toBe('Porto');
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt!);
    // A visitor cannot write someone else's Room: the callable only has "mine".
    expect((await myRoom(bob)).data.owner.uid).toBe(bob.uid);

    // Widgets replace the full order.
    const reordered = second.widgets
      .map((widget, at) => ({
        ...widget,
        position: (at + 1) % 7,
        enabled: widget.type !== 'memories',
      }))
      .sort((a, b) => a.position - b.position);
    await expect(
      call(
        alice,
        'updateMyRoomWidgets',
      )({
        widgets: reordered.slice(1),
        expectedUpdatedAt: second.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const widgets = (
      await call<Room>(
        alice,
        'updateMyRoomWidgets',
      )({ widgets: reordered, expectedUpdatedAt: second.updatedAt })
    ).data;
    expect(widgets.widgets.find((w) => w.type === 'memories')?.enabled).toBe(
      false,
    );
    await expect(
      call(
        alice,
        'updateMyRoomWidgets',
      )({
        widgets: reordered.map((widget) => ({ ...widget, enabled: true })),
        expectedUpdatedAt: second.updatedAt,
      }),
    ).rejects.toMatchObject({ details: { reason: 'STALE_WRITE' } });
    // Repeating the exact saved state is idempotent, not stale.
    await call(
      alice,
      'updateMyRoomWidgets',
    )({ widgets: reordered, expectedUpdatedAt: second.updatedAt });

    // Banner: an owned, ready room_banner asset, served only to permitted viewers.
    const banner = await readyAsset(alice, {
      purpose: 'room_banner',
      contentType: 'image/png',
      contentLength: png.length,
    });
    const withBanner = (
      await update(alice, {
        bannerMediaId: banner,
        expectedUpdatedAt: widgets.updatedAt,
      })
    ).data;
    expect(withBanner.bannerMediaId).toBe(banner);
    await expect(
      update(alice, {
        bannerMediaId: randomUUID(),
        expectedUpdatedAt: withBanner.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await get(banner, 'display', await tokenOf(alice))).status).toBe(
      200,
    );
    expect((await get(banner, 'display', await tokenOf(bob))).status).toBe(200);
    expect((await get(banner, 'display', await tokenOf(dave))).status).toBe(
      404,
    );

    // Visibility: friends only by default. Absence, strangers and guesses are one answer.
    const bobView = (await roomOf(bob, names.alice)).data;
    expect(bobView).toMatchObject({
      relationship: 'friend',
      visibility: null,
      updatedAt: null,
      bannerMediaId: banner,
    });
    expect(bobView.topFriends.size).toBeNull();
    const notFound = { code: 'functions/not-found' };
    for (const username of [names.alice, 'nobody_here_zz', 'x'.repeat(100)])
      await expect(roomOf(dave, username)).rejects.toMatchObject(notFound);
    await expect(roomOf(carol, names.alice)).rejects.toMatchObject(notFound);
    await expect(roomOf(bob, 'nobody_here_zz')).rejects.toMatchObject(notFound);
    await expect(call(bob, 'getRoom')({ username: '' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
    const members = (
      await update(alice, {
        visibility: 'members',
        expectedUpdatedAt: withBanner.updatedAt,
      })
    ).data;
    expect((await roomOf(carol, names.alice)).data.relationship).toBe('member');
    await expect(roomOf(dave, names.alice)).rejects.toMatchObject(notFound);

    // Top Friends: accepted friends only, shown per the owner's audience.
    for (const ineligible of [carol.uid, dave.uid, randomUUID()])
      await expect(
        call(
          alice,
          'updateMyRoomTopFriends',
        )({
          userIds: [ineligible],
          size: 4,
          visibility: 'visible',
          expectedUpdatedAt: members.updatedAt,
        }),
      ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await expect(
      call(
        alice,
        'updateMyRoomTopFriends',
      )({
        userIds: [bob.uid, bob.uid],
        size: 4,
        visibility: 'visible',
        expectedUpdatedAt: members.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const tops = (
      await call<Room>(
        alice,
        'updateMyRoomTopFriends',
      )({
        userIds: [bob.uid],
        size: 4,
        visibility: 'visible',
        expectedUpdatedAt: members.updatedAt,
      })
    ).data;
    expect(tops.topFriends).toMatchObject({
      size: 4,
      items: [{ uid: bob.uid }],
    });
    await expect(
      call(
        alice,
        'updateMyRoomTopFriends',
      )({
        userIds: [],
        size: 4,
        visibility: 'hidden',
        expectedUpdatedAt: members.updatedAt,
      }),
    ).rejects.toMatchObject({ details: { reason: 'STALE_WRITE' } });
    expect(
      (await roomOf(carol, names.alice)).data.topFriends.items?.map(
        (friend) => friend.uid,
      ),
    ).toEqual([bob.uid]);

    // Photos and Memories come from live Box content, re-authorized per viewer.
    const photo = await readyAsset(alice, {
      purpose: 'post_image',
      boxId,
      contentType: 'image/png',
      contentLength: png.length,
    });
    const post = await call<{ postId: string }>(
      alice,
      'createBoxPost',
    )({ boxId, text: 'Room memory', mediaAssetIds: [photo] });
    await call(alice, 'createBoxPost')({ boxId, text: 'Second' });
    await call(alice, 'createBoxPost')({ boxId, text: 'Third' });
    await call(bob, 'createBoxPost')({ boxId, text: 'From Bob' });
    await call(
      alice,
      'createLifeUpdate',
    )({
      audience: { type: 'boxes', boxIds: [boxId] },
      sections: { travel: 'Shared trip' },
    });
    await call(
      alice,
      'createLifeUpdate',
    )({
      audience: { type: 'only_me' },
      sections: { reading: 'Private' },
    });
    const photos = (username: string, user: Client) =>
      call<
        Page<{
          mediaAssetId: string;
          source: { kind: string; postId?: string };
        }>
      >(
        user,
        'listRoomPhotos',
      )({ username });
    for (const viewer of [alice, bob, carol])
      expect((await photos(names.alice, viewer)).data).toMatchObject({
        items: [
          {
            mediaAssetId: photo,
            width: 1,
            height: 1,
            source: { kind: 'post', postId: post.data.postId },
          },
        ],
        nextCursor: null,
      });
    await expect(photos(names.alice, dave)).rejects.toMatchObject(notFound);

    const year = new Date().getUTCFullYear();
    const mine = (filter: Record<string, unknown> = {}) =>
      call<Page<Memory>>(alice, 'listMyMemories')(filter);
    const all = (await mine()).data;
    expect(all.items.map((item) => item.kind).sort()).toEqual([
      'life_update',
      'life_update',
      'post',
      'post',
      'post',
      'post',
    ]);
    expect(
      (await mine({ year, type: 'life_updates' })).data.items.map(
        (item) => item.kind,
      ),
    ).toEqual(['life_update', 'life_update']);
    expect((await mine({ year: year - 1 })).data.items).toEqual([]);
    for (const bad of [
      { month: 3 },
      { year: 1969 },
      { year, month: 13 },
      { type: 'everything' },
      { limit: 0 },
      { cursor: 'garbage' },
    ])
      await expect(mine(bad)).rejects.toMatchObject({
        code: 'functions/invalid-argument',
        details: { reason: 'INVALID_INPUT' },
      });

    // Cursors are compact, opaque and bound to the same scope and filter.
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Page<Memory> = (
        await mine({ limit: 2, ...(cursor ? { cursor } : {}) })
      ).data;
      seen.push(...page.items.map((item) => `${item.kind}:${item.id}`));
      if (page.nextCursor)
        expect(page.nextCursor.length).toBeLessThanOrEqual(128);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    const paged = (await mine({ limit: 2 })).data.nextCursor!;
    await expect(mine({ limit: 2, year, cursor: paged })).rejects.toMatchObject(
      {
        details: { reason: 'INVALID_INPUT' },
      },
    );
    await expect(
      call(alice, 'listBoxMemories')({ boxId, limit: 2, cursor: paged }),
    ).rejects.toMatchObject({ details: { reason: 'INVALID_INPUT' } });

    // Box scope: members only, guessed ids look like any other absence.
    const boxMemories = (user: Client, id = boxId) =>
      call<Page<Memory>>(user, 'listBoxMemories')({ boxId: id });
    expect((await boxMemories(bob)).data.items).toHaveLength(5);
    await expect(boxMemories(dave)).rejects.toMatchObject(notFound);
    await expect(boxMemories(bob, randomUUID())).rejects.toMatchObject(
      notFound,
    );
    expect(
      (await boxMemories(alice)).data.items.some(
        (item) => item.kind === 'life_update',
      ),
    ).toBe(true);

    // Room scope: the owner's own content only, under the Room's visibility.
    const roomMemories = (user: Client, username = names.alice) =>
      call<Page<Memory>>(user, 'listRoomMemories')({ username });
    const forBob = (await roomMemories(bob)).data.items;
    expect(forBob.length).toBeGreaterThan(0);
    expect(forBob.every((item) => item.authorUid === alice.uid)).toBe(true);
    expect(forBob.some((item) => item.id === post.data.postId)).toBe(true);
    await expect(roomMemories(dave)).rejects.toMatchObject(notFound);
    await expect(roomMemories(bob, 'nobody_here_zz')).rejects.toMatchObject(
      notFound,
    );

    // Summaries count what the viewer can see, with the same scope rules.
    const summary = await call<{
      years: { year: number; count: number }[];
      year: number | null;
      months: { month: number; count: number }[];
    }>(
      alice,
      'getMyMemorySummary',
    )({});
    expect(summary.data.years[0]).toEqual({ year, count: 6 });
    expect(summary.data.year).toBe(year);
    await expect(
      call(alice, 'getMyMemorySummary')({ year: 1969 }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    expect(
      (
        await call<{ years: { count: number }[] }>(
          bob,
          'getBoxMemorySummary',
        )({ boxId })
      ).data.years[0]?.count,
    ).toBe(5);
    await expect(
      call(dave, 'getBoxMemorySummary')({ boxId }),
    ).rejects.toMatchObject(notFound);
    expect(
      (
        await call<{ years: { count: number }[] }>(
          carol,
          'getRoomMemorySummary',
        )({ username: names.alice })
      ).data.years[0]?.count,
    ).toBe(4);
    await expect(
      call(dave, 'getRoomMemorySummary')({ username: names.alice }),
    ).rejects.toMatchObject(notFound);

    // Hiding the Room closes every Room read for visitors, not for the owner.
    const hidden = (
      await update(alice, {
        visibility: 'hidden',
        expectedUpdatedAt: tops.updatedAt,
      })
    ).data;
    for (const viewer of [bob, carol]) {
      await expect(roomOf(viewer, names.alice)).rejects.toMatchObject(notFound);
      await expect(photos(names.alice, viewer)).rejects.toMatchObject(notFound);
      await expect(roomMemories(viewer)).rejects.toMatchObject(notFound);
    }
    expect((await get(banner, 'display', await tokenOf(bob))).status).toBe(404);
    expect((await roomOf(alice, names.alice)).data.visibility).toBe('hidden');
    const shown = (
      await update(alice, {
        visibility: 'friends',
        expectedUpdatedAt: hidden.updatedAt,
      })
    ).data;

    // A block hides the blocked author both ways and the Room from the blocked.
    await call(bob, 'setUserBlock')({ targetUid: alice.uid, blocked: true });
    await expect(roomOf(bob, names.alice)).rejects.toMatchObject(notFound);
    await expect(roomOf(alice, names.bob)).rejects.toMatchObject(notFound);
    await expect(roomMemories(bob)).rejects.toMatchObject(notFound);
    expect(
      (await boxMemories(bob)).data.items.filter(
        (item) => item.authorUid === alice.uid,
      ),
    ).toEqual([]);
    expect(
      (await boxMemories(alice)).data.items.filter(
        (item) => item.authorUid === bob.uid,
      ),
    ).toEqual([]);
    expect(
      (await myRoom(alice)).data.topFriends.items?.map((friend) => friend.uid),
    ).toEqual([]);
    await expect(
      call(
        alice,
        'updateMyRoomTopFriends',
      )({
        userIds: [bob.uid],
        size: 4,
        visibility: 'visible',
        expectedUpdatedAt: shown.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });

    // Replacing the banner retires the old asset's bytes.
    await update(alice, {
      bannerMediaId: null,
      expectedUpdatedAt: shown.updatedAt,
    });
    expect((await myRoom(alice)).data.bannerMediaId).toBeNull();
    expect((await get(banner, 'display', await tokenOf(alice))).status).toBe(
      404,
    );
  }, 120_000);
});

describe('native account safety: passwords, sessions, export, deletion, reports', () => {
  type Client = Awaited<ReturnType<typeof client>>;
  const base = 'http://127.0.0.1:5001/demo-paldora/europe-west4';
  const call = <Response = Record<string, unknown>>(
    user: Client,
    name: string,
  ) => httpsCallable<Record<string, unknown>, Response>(user.functions, name);
  const tokenOf = (user: Client) => user.auth.currentUser!.getIdToken();
  const download = (id: string, token: string | null, method = 'GET') =>
    fetch(`${base}/accountExportDownload/${id}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  const name = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  /**
   * The serving instance forgets a rotated epoch at once, but another function
   * instance may hold the old one for the 10-second epoch cache (the emulator
   * runs each function in its own worker). Refusal must land within that bound.
   */
  async function refusedWithin(user: Client, token: string) {
    let refused = false;
    for (let attempt = 0; attempt < 24 && !refused; attempt += 1) {
      const code = await call(
        user,
        'getMyProfile',
      )({}).then(
        () => 'accepted',
        (error: { code?: string }) => error.code,
      );
      refused = code === 'functions/unauthenticated';

      if (!refused) await pause(500);
    }
    expect(refused, 'an older session was accepted for over 12 seconds').toBe(
      true,
    );
    expect((await download(randomUUID(), token)).status).toBe(401);
  }

  it('changes the password with reauth and refuses every older token', async () => {
    const user = await client(name('pw'));
    const oldToken = await tokenOf(user);
    const newPassword = `Changed-${randomUUID()}!`;
    const change = call(user, 'changeMyPassword');

    await expect(
      change({ currentPassword: 'wrong-password', newPassword }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(
      change({ currentPassword: user.password, newPassword: 'short' }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    // Nothing changed yet: the old token and password still work.
    await call(user, 'getMyProfile')({});

    expect(
      (await change({ currentPassword: user.password, newPassword })).data,
    ).toEqual({ ok: true, signInRequired: true });

    // The callable gate and the HTTP gate both refuse the pre-change token.
    await refusedWithin(user, oldToken);
    // Old password is dead, new one works and mints a usable session.
    await expect(
      signInWithEmailAndPassword(user.auth, user.email, user.password),
    ).rejects.toThrow();
    await signInWithEmailAndPassword(user.auth, user.email, newPassword);
    await call(user, 'getMyProfile')({});
  }, 60_000);

  it('signs out everywhere without a password', async () => {
    const user = await client(name('so'));
    const oldToken = await tokenOf(user);
    expect((await call(user, 'signOutEverywhere')({})).data).toEqual({
      ok: true,
      signInRequired: true,
    });
    await refusedWithin(user, oldToken);
    // The password is unchanged; signing in again restores access.
    await signInWithEmailAndPassword(user.auth, user.email, user.password);
    await call(user, 'getMyProfile')({});
    await expect(
      httpsCallable(
        (await client(name('un'), true, false)).functions,
        'signOutEverywhere',
      )({}),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
  }, 60_000);

  it('rate limits password guessing', async () => {
    const user = await client(name('rl'));
    const request = call(user, 'requestAccountDeletion');
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(request({ password: 'wrong' })).rejects.toMatchObject({
        code: 'functions/permission-denied',
      });
    await expect(request({ password: user.password })).rejects.toMatchObject({
      code: 'functions/resource-exhausted',
      details: { reason: 'RATE_LIMITED' },
    });
  }, 60_000);

  it('exports and downloads only the caller latest ready archive', async () => {
    const alice = await client(name('exa'));
    const bob = await client(name('exb'));
    expect((await call(alice, 'getAccountExport')({})).data).toEqual({
      export: null,
    });
    const first = (
      await call<{ export: { id: string; status: string } }>(
        alice,
        'requestAccountExport',
      )({})
    ).data.export;
    expect(first.status).toBe('ready');
    expect(
      (await call<{ export: { id: string } }>(alice, 'getAccountExport')({}))
        .data.export.id,
    ).toBe(first.id);

    const ok = await download(first.id, await tokenOf(alice));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect(ok.headers.get('content-disposition')).toBe(
      'attachment; filename="paldora-data.json"',
    );
    expect(ok.headers.get('content-type')).toContain('application/json');
    const archive = (await ok.json()) as Record<string, unknown>;
    expect(JSON.stringify(archive)).toContain(alice.uid);
    expect(JSON.stringify(archive)).not.toContain(bob.uid);

    // Absence and denial share one 404 body: foreign, guessed, malformed.
    const bobToken = await tokenOf(bob);
    const denied = await download(first.id, bobToken);
    const guessed = await download(randomUUID(), bobToken);
    const malformed = await download('not-an-id', bobToken);
    for (const response of [denied, guessed, malformed])
      expect(response.status).toBe(404);
    const body = await denied.text();
    expect(await guessed.text()).toBe(body);
    expect(await malformed.text()).toBe(body);
    expect(denied.headers.get('cache-control')).toBe('private, no-store');
    expect((await download(first.id, null)).status).toBe(401);
    expect((await download(first.id, 'garbage')).status).toBe(401);
    expect(
      (await download(first.id, await tokenOf(alice), 'POST')).status,
    ).toBe(405);

    // A newer export supersedes the older id, exactly like the web route.
    const second = (
      await call<{ export: { id: string } }>(alice, 'requestAccountExport')({})
    ).data.export;
    expect(second.id).not.toBe(first.id);
    expect((await download(first.id, await tokenOf(alice))).status).toBe(404);
    expect((await download(second.id, await tokenOf(alice))).status).toBe(200);
    // Expiry closes the download.
    await adminDb
      .collection('nativeExports')
      .doc(second.id)
      .update({ expiresAt: Date.now() - 1_000 });
    expect((await download(second.id, await tokenOf(alice))).status).toBe(404);
    expect(
      (
        await call<{ export: { status: string } }>(
          alice,
          'getAccountExport',
        )({})
      ).data.export.status,
    ).toBe('expired');
  }, 90_000);

  it('applies the web deletion rules: reauth, owned Boxes, grace window, generations', async () => {
    type Deletion = {
      deletion: {
        id: string;
        status: string;
        requestedAt: number;
        dueAt: number;
      };
    };
    const owner = await client(name('dlo'));
    await call(owner, 'createBox')({ name: 'Owned Box' });
    await expect(
      call(owner, 'requestAccountDeletion')({ password: owner.password }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await call(owner, 'getAccountDeletion')({})).data).toEqual({
      deletion: null,
    });

    const user = await client(name('dlu'));
    expect((await call(user, 'getAccountDeletion')({})).data).toEqual({
      deletion: null,
    });
    await expect(
      call(user, 'requestAccountDeletion')({ password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
    // Another account's password does not authorize this account.
    await expect(
      call(user, 'requestAccountDeletion')({ password: owner.password }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(
      call(user, 'cancelAccountDeletion')({ password: user.password }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });

    const requested = (
      await call<Deletion>(
        user,
        'requestAccountDeletion',
      )({
        password: user.password,
      })
    ).data.deletion;
    expect(requested.status).toBe('pending');
    expect(requested.dueAt - requested.requestedAt).toBe(
      7 * 24 * 60 * 60 * 1_000,
    );
    // Repeating while pending is idempotent: same generation.
    expect(
      (
        await call<Deletion>(
          user,
          'requestAccountDeletion',
        )({
          password: user.password,
        })
      ).data.deletion.id,
    ).toBe(requested.id);
    expect(
      (await call<Deletion>(user, 'getAccountDeletion')({})).data.deletion,
    ).toMatchObject({ id: requested.id, status: 'pending' });

    await expect(
      call(user, 'cancelAccountDeletion')({ password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
    // At the deadline the window is closed, even with the right password.
    const ref = adminDb.collection('nativeDeletionRequests').doc(user.uid);
    await ref.update({ dueAt: Date.now() - 1_000 });
    await expect(
      call(user, 'cancelAccountDeletion')({ password: user.password }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await ref.update({ dueAt: requested.dueAt });

    const cancelled = (
      await call<Deletion>(
        user,
        'cancelAccountDeletion',
      )({
        password: user.password,
      })
    ).data.deletion;
    expect(cancelled).toMatchObject({ id: requested.id, status: 'cancelled' });
    expect((await call(user, 'getAccountDeletion')({})).data).toEqual({
      deletion: null,
    });
    await expect(
      call(user, 'cancelAccountDeletion')({ password: user.password }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
    // A new request after cancelling starts a new generation.
    const again = (
      await call<Deletion>(
        user,
        'requestAccountDeletion',
      )({
        password: user.password,
      })
    ).data.deletion;
    expect(again.id).not.toBe(requested.id);
  }, 90_000);

  it('reports comments, lists own receipts and owner notices without leaking', async () => {
    type Receipt = {
      id: string;
      targetKind: string;
      targetId: string;
      status: string;
    };
    const alice = await client(name('rpa'));
    const bobName = name('rpb');
    const bob = await client(bobName);
    const outsider = await client(name('rpc'));
    const boxId = (
      await call<{ id: string }>(alice, 'createBox')({ name: 'Report Box' })
    ).data.id;
    const invite = await call<{ invitationId: string }>(
      alice,
      'inviteBox',
    )({
      boxId,
      username: bobName,
    });
    await call(
      bob,
      'acceptBoxInvitation',
    )({
      invitationId: invite.data.invitationId,
    });
    const postId = (
      await call<{ postId: string }>(
        alice,
        'createBoxPost',
      )({
        boxId,
        text: 'Post',
      })
    ).data.postId;
    const commentId = (
      await call<{ commentId: string }>(
        bob,
        'createBoxComment',
      )({
        boxId,
        postId,
        text: 'A comment',
      })
    ).data.commentId;

    const report = call<{ reportId: string }>(alice, 'reportBoxComment');
    await expect(
      report({ commentId, category: 'bullying', detail: null }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    // Outsiders and guessed ids are indistinguishable.
    const outsiderReport = call(outsider, 'reportBoxComment');
    const hidden = await outsiderReport({
      commentId,
      category: 'spam',
      detail: null,
    }).catch((error: unknown) => error);
    const guessed = await outsiderReport({
      commentId: randomUUID(),
      category: 'spam',
      detail: null,
    }).catch((error: unknown) => error);
    expect(hidden).toMatchObject({ code: 'functions/not-found' });
    expect(guessed).toMatchObject({ code: 'functions/not-found' });
    expect((hidden as Error).message).toBe((guessed as Error).message);

    const reportId = (
      await report({
        commentId,
        category: 'spam',
        detail: 'Synthetic reason for the flow test.',
      })
    ).data.reportId;
    // Repeating is idempotent.
    expect(
      (await report({ commentId, category: 'spam', detail: null })).data
        .reportId,
    ).toBe(reportId);

    const mine = call<{ items: Receipt[]; nextCursor: string | null }>(
      alice,
      'listMyReports',
    );
    expect((await mine({})).data.items).toMatchObject([
      {
        id: reportId,
        targetKind: 'comment',
        targetId: commentId,
        status: 'open',
      },
    ]);
    // Receipts are private: the reported author and others see none.
    expect(
      (await call<{ items: Receipt[] }>(bob, 'listMyReports')({})).data.items,
    ).toEqual([]);
    await expect(mine({ cursor: 'bad' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
    await expect(mine({ cursor: randomUUID() })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });

    // The comment owner learns only after staff hide it.
    const notices = call<{
      items: Array<{ targetKind: string; targetId: string }>;
    }>(bob, 'listMyModerationNotices');
    expect((await notices({})).data.items).toEqual([]);
    const staff = await client(name('rpm'));
    await moderationMaintenance.grantStaff('ops.local', staff.uid, 'moderator');
    await moderationMaintenance.actOnCase(staff.uid, reportId, {
      action: 'hide',
      reason: 'Synthetic hide for the flow test.',
      idempotencyKey: randomUUID(),
    });
    expect((await notices({})).data.items).toMatchObject([
      { targetKind: 'comment', targetId: commentId },
    ]);
    expect(
      (await call<{ items: unknown[] }>(alice, 'listMyModerationNotices')({}))
        .data.items,
    ).toEqual([]);
  }, 90_000);
});

describe('native Box management, friend cancel and comment threads', () => {
  type Client = Awaited<ReturnType<typeof client>>;
  const call = <Response = Record<string, unknown>>(
    user: Client,
    name: string,
  ) => httpsCallable<Record<string, unknown>, Response>(user.functions, name);
  const name = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
  type BoxView = {
    id: string;
    name: string;
    status: string;
    currentUserRole: string;
  };
  type Member = { uid: string; role: string };

  const boxOf = (user: Client, boxId: string) =>
    call<BoxView>(user, 'getBox')({ boxId }).then((result) => result.data);
  const membersOf = async (user: Client, boxId: string) =>
    (await call<{ items: Member[] }>(user, 'listBoxMembers')({ boxId })).data
      .items;
  const roleOf = async (user: Client, boxId: string, uid: string) =>
    (await membersOf(user, boxId)).find((member) => member.uid === uid)?.role;
  async function join(
    owner: Client,
    box: string,
    user: Client,
    username: string,
  ) {
    const invite = await call<{ invitationId: string }>(
      owner,
      'inviteBox',
    )({
      boxId: box,
      username,
    });
    await call(
      user,
      'acceptBoxInvitation',
    )({
      invitationId: invite.data.invitationId,
    });
  }
  async function denied(work: Promise<unknown>, code = 'functions/not-found') {
    const error = await work.then(
      () => null,
      (caught: unknown) => caught as { code: string; message: string },
    );
    expect(error, 'the call should have been refused').not.toBeNull();
    expect(error).toMatchObject({ code });
    return error!.message;
  }

  it('applies the web owner/admin/member rules to Box management', async () => {
    const names = {
      owner: name('mo'),
      admin: name('ma'),
      member: name('mm'),
      other: name('mn'),
    };
    const owner = await client(names.owner);
    const admin = await client(names.admin);
    const member = await client(names.member);
    const other = await client(names.other);
    const outsider = await client(name('mx'));
    const boxId = (
      await call<{ id: string }>(owner, 'createBox')({ name: 'Mgmt Box' })
    ).data.id;
    await join(owner, boxId, admin, names.admin);
    await join(owner, boxId, member, names.member);
    await join(owner, boxId, other, names.other);

    // updateBox: owner only, non-leaking, validated.
    const guessed = randomUUID();
    const messages = await Promise.all([
      denied(call(member, 'updateBox')({ boxId, name: 'Hijack' })),
      denied(call(outsider, 'updateBox')({ boxId, name: 'Hijack' })),
      denied(call(owner, 'updateBox')({ boxId: guessed, name: 'Hijack' })),
    ]);
    expect(new Set(messages).size).toBe(1);
    await denied(call(admin, 'updateBox')({ boxId, status: 'archived' }));
    await expect(
      call(owner, 'updateBox')({ boxId, name: '   ' }),
    ).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
    await expect(call(owner, 'updateBox')({ boxId })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
      details: { reason: 'INVALID_INPUT' },
    });
    await expect(
      call(owner, 'updateBox')({ boxId, status: 'deleted' }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    const renamed = (
      await call<BoxView>(owner, 'updateBox')({ boxId, name: '  Renamed Box ' })
    ).data;
    expect(renamed).toMatchObject({
      id: boxId,
      name: 'Renamed Box',
      status: 'active',
      currentUserRole: 'owner',
    });
    expect((await boxOf(member, boxId)).name).toBe('Renamed Box');
    expect(
      (await call<BoxView>(owner, 'updateBox')({ boxId, status: 'archived' }))
        .data.status,
    ).toBe('archived');
    // An archived Box stays readable but rejects new posts.
    expect((await boxOf(member, boxId)).status).toBe('archived');
    await denied(call(member, 'createBoxPost')({ boxId, text: 'Too late' }));
    // Archiving is not a lock-out: the owner can restore.
    expect(
      (
        await call<BoxView>(
          owner,
          'updateBox',
        )({
          boxId,
          status: 'active',
          name: 'Mgmt Box',
        })
      ).data,
    ).toMatchObject({ status: 'active', name: 'Mgmt Box' });

    // setBoxMemberRole.
    await denied(
      call(
        member,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: other.uid,
        role: 'admin',
      }),
    );
    await denied(
      call(
        outsider,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: other.uid,
        role: 'admin',
      }),
    );
    await expect(
      call(
        owner,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: other.uid,
        role: 'owner',
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(
      call(
        owner,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: owner.uid,
        role: 'member',
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await call(
      owner,
      'setBoxMemberRole',
    )({
      boxId,
      memberUid: admin.uid,
      role: 'admin',
    });
    expect(await roleOf(owner, boxId, admin.uid)).toBe('admin');
    // Setting the role someone already has is refused, as on the web.
    await denied(
      call(
        owner,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: admin.uid,
        role: 'admin',
      }),
    );
    // The owner's role is never changeable.
    await denied(
      call(
        admin,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: owner.uid,
        role: 'member',
      }),
    );
    // An admin may promote a member but not demote an admin.
    await call(
      admin,
      'setBoxMemberRole',
    )({
      boxId,
      memberUid: member.uid,
      role: 'admin',
    });
    expect(await roleOf(owner, boxId, member.uid)).toBe('admin');
    await denied(
      call(
        admin,
        'setBoxMemberRole',
      )({
        boxId,
        memberUid: member.uid,
        role: 'member',
      }),
    );
    await call(
      owner,
      'setBoxMemberRole',
    )({
      boxId,
      memberUid: member.uid,
      role: 'member',
    });
    expect(await roleOf(owner, boxId, member.uid)).toBe('member');

    // removeBoxMember: owner or admin, never the owner.
    await denied(
      call(member, 'removeBoxMember')({ boxId, memberUid: other.uid }),
    );
    await denied(
      call(outsider, 'removeBoxMember')({ boxId, memberUid: other.uid }),
    );
    await denied(
      call(admin, 'removeBoxMember')({ boxId, memberUid: owner.uid }),
    );
    await denied(
      call(owner, 'removeBoxMember')({ boxId, memberUid: outsider.uid }),
    );
    await call(admin, 'removeBoxMember')({ boxId, memberUid: other.uid });
    expect(await roleOf(owner, boxId, other.uid)).toBeUndefined();
    expect((await boxOf(owner, boxId)).id).toBe(boxId);
    await denied(call(other, 'getBox')({ boxId }));
    await denied(call(other, 'createBoxPost')({ boxId, text: 'Still here?' }));
    expect(
      (
        await call<{ items: Array<{ id: string }> }>(other, 'listMyBoxes')({})
      ).data.items.some((item) => item.id === boxId),
    ).toBe(false);
    await denied(
      call(owner, 'removeBoxMember')({ boxId, memberUid: other.uid }),
    );
    // A removed member cannot leave, rename or re-add themselves.
    await denied(call(other, 'leaveBox')({ boxId }));
    await denied(call(other, 'updateBox')({ boxId, name: 'Back' }));

    // transferBoxOwnership is owner only, atomic, and needs an active member.
    await denied(
      call(admin, 'transferBoxOwnership')({ boxId, memberUid: member.uid }),
    );
    await denied(
      call(outsider, 'transferBoxOwnership')({ boxId, memberUid: member.uid }),
    );
    await expect(
      call(owner, 'transferBoxOwnership')({ boxId, memberUid: owner.uid }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await denied(
      call(owner, 'transferBoxOwnership')({ boxId, memberUid: outsider.uid }),
    );
    await denied(
      call(owner, 'transferBoxOwnership')({ boxId, memberUid: other.uid }),
    );
    await denied(
      call(owner, 'transferBoxOwnership')({ boxId, memberUid: randomUUID() }),
    );

    // leaveBox: the owner must transfer first.
    await denied(call(owner, 'leaveBox')({ boxId }));
    await denied(call(outsider, 'leaveBox')({ boxId }));
    await denied(call(owner, 'leaveBox')({ boxId: randomUUID() }));
    expect(await roleOf(owner, boxId, owner.uid)).toBe('owner');

    await call(owner, 'transferBoxOwnership')({ boxId, memberUid: admin.uid });
    expect((await boxOf(admin, boxId)).currentUserRole).toBe('owner');
    expect((await boxOf(owner, boxId)).currentUserRole).toBe('admin');
    const roles = await membersOf(admin, boxId);
    expect(roles.filter((entry) => entry.role === 'owner')).toEqual([
      expect.objectContaining({ uid: admin.uid }),
    ]);
    expect(roles.find((entry) => entry.uid === owner.uid)?.role).toBe('admin');
    // The former owner has lost owner-only actions at once.
    await denied(call(owner, 'updateBox')({ boxId, name: 'Mine' }));
    await denied(
      call(owner, 'transferBoxOwnership')({ boxId, memberUid: member.uid }),
    );
    await denied(
      call(owner, 'beginBoxDeletion')({ boxId, confirmName: 'Mgmt Box' }),
    );
    expect(
      (await call<BoxView>(admin, 'updateBox')({ boxId, name: 'New Era' })).data
        .name,
    ).toBe('New Era');

    // Anyone but the owner may leave, once.
    await call(owner, 'leaveBox')({ boxId });
    await denied(call(owner, 'getBox')({ boxId }));
    await denied(call(owner, 'leaveBox')({ boxId }));
    await call(member, 'leaveBox')({ boxId });
    expect(await membersOf(admin, boxId)).toEqual([
      expect.objectContaining({ uid: admin.uid, role: 'owner' }),
    ]);
    expect((await boxOf(admin, boxId)).id).toBe(boxId);
  }, 120_000);

  it('cancels only your own pending friend request', async () => {
    const aliceName = name('fa');
    const bobName = name('fb');
    const alice = await client(aliceName);
    const bob = await client(bobName);
    const outsider = await client(name('fx'));
    const list = (user: Client, status: string) =>
      call<{ items: Array<{ id: string }> }>(
        user,
        'listMyFriendships',
      )({
        status,
      }).then((result) => result.data.items.map((item) => item.id));
    const sent = await call<{ requestId: string }>(
      alice,
      'sendFriendRequest',
    )({
      username: bobName,
    });
    const id = sent.data.requestId;
    // The recipient, an outsider and a guessed id are indistinguishable.
    const messages = await Promise.all([
      denied(call(bob, 'cancelFriendRequest')({ requestId: id })),
      denied(call(outsider, 'cancelFriendRequest')({ requestId: id })),
      denied(call(alice, 'cancelFriendRequest')({ requestId: randomUUID() })),
    ]);
    expect(new Set(messages).size).toBe(1);
    expect(await list(alice, 'sent')).toEqual([id]);
    await call(alice, 'cancelFriendRequest')({ requestId: id });
    expect(await list(alice, 'sent')).toEqual([]);
    expect(await list(bob, 'pending')).toEqual([]);
    await denied(call(alice, 'cancelFriendRequest')({ requestId: id }));
    await denied(call(bob, 'acceptFriendRequest')({ requestId: id }));
    // The request is gone, so a new one is allowed.
    const again = await call<{ requestId: string }>(
      alice,
      'sendFriendRequest',
    )({
      username: bobName,
    });
    await call(bob, 'acceptFriendRequest')({ requestId: again.data.requestId });
    // An accepted friendship is not a request: cancelling it is refused.
    await denied(
      call(alice, 'cancelFriendRequest')({ requestId: again.data.requestId }),
    );
    expect(await list(alice, 'accepted')).toEqual([again.data.requestId]);
  }, 60_000);

  it('serves comment threads, replies and a pinned thread with web hiding rules', async () => {
    const ownerName = name('co');
    const memberName = name('cm');
    const blockedName = name('cb');
    const gone = name('cg');
    const owner = await client(ownerName);
    const member = await client(memberName);
    const blocked = await client(blockedName);
    const removed = await client(gone);
    const outsider = await client(name('cx'));
    const boxId = (
      await call<{ id: string }>(owner, 'createBox')({ name: 'Threads' })
    ).data.id;
    await join(owner, boxId, member, memberName);
    await join(owner, boxId, blocked, blockedName);
    await join(owner, boxId, removed, gone);
    const postId = (
      await call<{ postId: string }>(
        owner,
        'createBoxPost',
      )({
        boxId,
        text: 'Thread post',
      })
    ).data.postId;
    const otherPost = (
      await call<{ postId: string }>(
        owner,
        'createBoxPost',
      )({
        boxId,
        text: 'Other post',
      })
    ).data.postId;
    const comment = async (
      user: Client,
      text: string,
      parentId?: string,
      post = postId,
    ) =>
      (
        await call<{ commentId: string }>(
          user,
          'createBoxComment',
        )({
          boxId,
          postId: post,
          text,
          ...(parentId ? { parentId } : {}),
        })
      ).data.commentId;
    type Item =
      | {
          kind: 'comment';
          comment: { id: string; text: string; authorUid: string };
        }
      | { kind: 'deleted' | 'hidden'; id: string };
    type Thread = {
      root: Item;
      rootId: string;
      replies: Item[];
      replyCount: number;
    };
    const idOf = (item: Item) =>
      item.kind === 'comment' ? item.comment.id : item.id;
    const threads = (user: Client, cursor?: string, post = postId) =>
      call<{ items: Thread[]; nextCursor: string | null }>(
        user,
        'listBoxCommentThreads',
      )({ boxId, postId: post, ...(cursor ? { cursor } : {}) });
    const replies = (user: Client, rootId: string, cursor?: string) =>
      call<{ items: Item[]; nextCursor: string | null }>(
        user,
        'listBoxCommentReplies',
      )({ boxId, postId, rootId, ...(cursor ? { cursor } : {}) });
    const pinned = (user: Client, commentId: string, post = postId) =>
      call<Thread>(
        user,
        'getBoxCommentThread',
      )({ boxId, postId: post, commentId });

    // root1 has five replies (one by the blocked member); root2 is by the
    // blocked member; root3 was deleted but keeps a reply; root4 was deleted.
    const root1 = await comment(member, 'Root one');
    const r1 = await comment(owner, 'Reply 1', root1);
    const r2 = await comment(blocked, 'Reply 2 (blocked)', root1);
    const r3 = await comment(owner, 'Reply 3', root1);
    const r4 = await comment(owner, 'Reply 4', root1);
    const r5 = await comment(owner, 'Reply 5', root1);
    const root2 = await comment(blocked, 'Root two (blocked)');
    const root3 = await comment(member, 'Root three');
    const r3a = await comment(owner, 'Reply to deleted', root3);
    const root4 = await comment(member, 'Root four');
    for (const id of [root3, root4])
      await call(member, 'deleteBoxComment')({ boxId, postId, commentId: id });
    const foreign = await comment(
      owner,
      'Other post root',
      undefined,
      otherPost,
    );

    // Owner view: newest root first, a three-reply preview and the full count.
    const page = (await threads(owner)).data;
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((thread) => thread.rootId)).toEqual([
      root3,
      root2,
      root1,
    ]);
    const [t3, t2, t1] = page.items as [Thread, Thread, Thread];
    expect(t3.root).toMatchObject({ kind: 'deleted', id: root3 });
    expect(t3.replyCount).toBe(1);
    expect(t3.replies.map(idOf)).toEqual([r3a]);
    expect(t2.root).toMatchObject({ kind: 'comment' });
    expect(t1.replyCount).toBe(5);
    expect(t1.replies.map(idOf)).toEqual([r1, r2, r3]);
    expect((await replies(owner, root1)).data.items.map(idOf)).toEqual([
      r1,
      r2,
      r3,
      r4,
      r5,
    ]);

    // The member blocked the other: that author is a bare placeholder.
    await call(
      member,
      'setUserBlock',
    )({ targetUid: blocked.uid, blocked: true });
    const memberView = (await threads(member)).data.items;
    const m2 = memberView.find((thread) => thread.rootId === root2)!;
    expect(m2).toMatchObject({
      root: { kind: 'hidden', id: root2 },
      replies: [],
      replyCount: 0,
    });
    expect(JSON.stringify(m2)).not.toMatch(/Root two|authorUid|text/);
    const m1 = memberView.find((thread) => thread.rootId === root1)!;
    expect(m1.replies.map((item) => item.kind)).toEqual([
      'comment',
      'hidden',
      'comment',
    ]);
    expect(m1.replyCount).toBe(5);
    expect(JSON.stringify(m1)).not.toContain('Reply 2');
    // The block hides both ways, so the blocked member sees the same.
    const blockedView = (await threads(blocked)).data.items;
    expect(blockedView.find((t) => t.rootId === root1)!.root.kind).toBe(
      'hidden',
    );
    expect(
      (await replies(member, root1)).data.items.map((item) => item.kind),
    ).toEqual(['comment', 'hidden', 'comment', 'comment', 'comment']);
    // A hidden root cannot be opened for replies or pinned.
    await denied(replies(member, root2));
    await denied(pinned(member, root2));
    await denied(pinned(member, r2));

    // Pinned thread: a reply beyond the preview is appended to it.
    const deep = (await pinned(owner, r5)).data;
    expect(deep.rootId).toBe(root1);
    expect(deep.replyCount).toBe(5);
    expect(deep.replies.map(idOf)).toEqual([r1, r2, r3, r5]);
    expect((await pinned(owner, r1)).data.replies.map(idOf)).toEqual([
      r1,
      r2,
      r3,
    ]);
    expect((await pinned(owner, root1)).data.replies.map(idOf)).toEqual([
      r1,
      r2,
      r3,
    ]);
    // A reply under a deleted root keeps a deleted placeholder as the root.
    const orphan = (await pinned(owner, r3a)).data;
    expect(orphan.root).toMatchObject({ kind: 'deleted', id: root3 });
    expect(orphan.replies.map(idOf)).toEqual([r3a]);
    expect(orphan.replyCount).toBe(1);
    // Deleted comments themselves, and other posts' ids, are not found.
    await denied(pinned(owner, root3));
    await denied(pinned(owner, root4));
    await denied(pinned(owner, foreign));
    // As on the web, a deleted root still lists its remaining replies.
    expect((await replies(owner, root3)).data.items.map(idOf)).toEqual([r3a]);
    expect((await replies(owner, root4)).data.items).toEqual([]);
    await denied(replies(owner, r1));
    await denied(replies(owner, foreign));

    // Absence and denial are one answer for every thread callable.
    const guessedId = randomUUID();
    const refusals = await Promise.all([
      denied(threads(outsider)),
      denied(threads(owner, undefined, guessedId)),
      denied(replies(outsider, root1)),
      denied(replies(owner, guessedId)),
      denied(pinned(outsider, r1)),
      denied(pinned(owner, guessedId)),
      denied(pinned(owner, r1, guessedId)),
    ]);
    expect(new Set(refusals).size).toBe(1);

    // Cursors: malformed is rejected up front; a stranger's id is not found.
    for (const bad of ['bad', 'x'.repeat(40)]) {
      await expect(threads(owner, bad)).rejects.toMatchObject({
        code: 'functions/invalid-argument',
        details: { reason: 'INVALID_INPUT' },
      });
      await expect(replies(owner, root1, bad)).rejects.toMatchObject({
        code: 'functions/invalid-argument',
      });
    }
    await denied(threads(owner, guessedId));
    await denied(threads(owner, r1));
    await denied(replies(owner, root1, guessedId));
    await denied(replies(owner, root1, root2));

    // Roots page twenty at a time, newest first, without gaps.
    const extra: string[] = [];
    for (let at = 0; at < 20; at += 1)
      extra.push(await comment(owner, `Bulk ${at}`));
    const first = (await threads(owner)).data;
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBe(first.items[19]!.rootId);
    const second = (await threads(owner, first.nextCursor!)).data;
    const all = [...first.items, ...second.items].map((t) => t.rootId);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(extra.length + 3);
    expect(second.nextCursor).toBeNull();
    expect(all.slice(0, 20)).toEqual([...extra].reverse().slice(0, 20));

    // A removed member loses every thread read at once.
    await call(owner, 'removeBoxMember')({ boxId, memberUid: removed.uid });
    await denied(threads(removed));
    await denied(replies(removed, root1));
    await denied(pinned(removed, r1));
  }, 180_000);
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
