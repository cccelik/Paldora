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
  return { uid, db, functions, auth };
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

describe('native contract coverage of this flow', () => {
  it('exercises every native callable', () => {
    const missing = [...registry.keys()].filter((name) => !exercised.has(name));
    process.stdout.write(
      `native-contract: ${exercised.size}/${registry.size} callables exercised; not exercised: ${missing.join(', ')}\n`,
    );
    expect(missing).toEqual([]);
  });
});
