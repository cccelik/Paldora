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
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
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
  }, 30_000);
});

describe('native contract coverage of this flow', () => {
  it('reports which callables the flow exercised', () => {
    const missing = [...registry.keys()].filter((name) => !exercised.has(name));
    process.stdout.write(
      `native-contract: ${exercised.size}/${registry.size} callables exercised; not exercised: ${missing.join(', ')}\n`,
    );
    expect(exercised.size).toBeGreaterThan(0);
  });
});
