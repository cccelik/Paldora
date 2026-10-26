import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeAccountLifecycle } from './native-account-lifecycle.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeMedia } from './native-media.js';
import sharp from 'sharp';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Auth, Firestore and Storage emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `lifecycle-${randomUUID()}`,
);
const auth = getAuth(app),
  db = getFirestore(app),
  storage = getStorage(app);
const bucketName = 'demo-paldora.firebasestorage.app';
const lifecycle = new NativeAccountLifecycle(db, auth, storage, bucketName);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const verify = async (_uid: string, _email: string, password: string) => {
  if (password !== 'correct-password') throw new Error('wrong password');
};
afterAll(() => deleteApp(app));

async function person() {
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
async function drain(uid: string, due: number) {
  const phases: string[] = [];
  for (let step = 0; step < 100; step += 1) {
    const phase = await lifecycle.processDeletion(uid, due);
    phases.push(phase);
    if (!(await db.collection('nativeDeletionRequests').doc(uid).get()).exists)
      return phases;
  }
  throw new Error('erasure did not converge');
}

describe('private archive and generation-tagged account erasure', () => {
  it('pages a larger archive into Storage and streams it back to its owner', async () => {
    const uid = await person();
    const batch = db.batch();
    for (let index = 0; index < 125; index += 1) {
      batch.set(db.collection('nativeLifeUpdates').doc(randomUUID()), {
        authorUid: uid,
        status: 'active',
        sections: { currently: `Entry ${index} ${'x'.repeat(4096)}` },
        audience: 'only_me',
        createdAt: Date.now(),
      });
    }
    await batch.commit();
    const archive = await lifecycle.requestExport(uid);
    const chunks: Buffer[] = [];
    for await (const chunk of await lifecycle.downloadStream(uid, archive.id))
      chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString()) as {
      format: string;
      lifeUpdates: Array<{ authorUid: string }>;
    };
    expect(payload.format).toBe('paldora-json-v1');
    expect(payload.lifeUpdates).toHaveLength(125);
    expect(payload.lifeUpdates.every((row) => row.authorUid === uid)).toBe(
      true,
    );
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500_000);
  });

  it('exports only owner data and expires bytes after seven days', async () => {
    const uid = await person(),
      other = await person();
    const otherBox = await boxes.create(other, 'Not Yours');
    const otherPost = await posts.create(
      otherBox.id,
      other,
      'Other member writing',
    );
    const box = await boxes.create(uid, 'Archive Box');
    const post = await posts.create(box.id, uid, 'My private writing');
    const comment = await posts.createComment(box.id, post, uid, 'My comment');
    await posts.setReaction(box.id, post, uid, '❤️');
    const lifeId = randomUUID();
    await db
      .collection('nativeLifeUpdates')
      .doc(lifeId)
      .set({
        authorUid: uid,
        status: 'active',
        sections: { currently: 'Testing' },
        audience: 'only_me',
        createdAt: Date.now(),
      });
    await db
      .collection('nativeRooms')
      .doc(uid)
      .set({ themePreset: 'paper', version: 1 });
    const mediaId = randomUUID();
    await db
      .collection('nativeMediaAssets')
      .doc(mediaId)
      .set({
        ownerUid: uid,
        purpose: 'avatar',
        status: 'ready',
        contentType: 'image/jpeg',
        contentLength: 42,
        rawPath: 'private/secret',
        objectPaths: ['private/secret'],
        createdAt: Date.now(),
      });
    await db
      .collection('nativeProfiles')
      .doc(uid)
      .update({ displayName: 'Archive owner' });
    const archive = await lifecycle.requestExport(uid);
    expect(archive.status).toBe('ready');
    const bytes = await lifecycle.download(uid, archive.id);
    const data = JSON.parse(bytes.toString()) as {
      format: string;
      profile: { account: { email: string } };
      posts: Array<{ id: string }>;
      comments: Array<{ id: string }>;
      reactions: Array<{ uid: string }>;
      lifeUpdates: Array<{ id: string }>;
      room: { settings: { themePreset: string } };
      media: Array<{ id: string; rawPath?: string }>;
    };
    expect(data.format).toBe('paldora-json-v1');
    expect(data.profile.account.email).toBe(`${uid}@example.invalid`);
    expect(data.posts.map((item) => item.id)).toContain(post);
    expect(data.posts.map((item) => item.id)).not.toContain(otherPost);
    expect(data.comments.map((item) => item.id)).toContain(comment);
    expect(data.reactions.map((item) => item.uid)).toContain(uid);
    expect(data.lifeUpdates.map((item) => item.id)).toContain(lifeId);
    expect(data.room.settings.themePreset).toBe('paper');
    expect(
      data.media.find((item) => item.id === mediaId)?.rawPath,
    ).toBeUndefined();
    await expect(lifecycle.download(other, archive.id)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const row = db.collection('nativeExports').doc(archive.id);
    const path = (await row.get()).get('objectPath') as string;
    await row.update({ expiresAt: Date.now() - 1 });
    await lifecycle.expireExports();
    expect((await storage.bucket(bucketName).file(path).exists())[0]).toBe(
      false,
    );
    await expect(lifecycle.download(uid, archive.id)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('requires reauthentication and Box transfer; cancellation wins before the exact deadline', async () => {
    const uid = await person();
    const box = await boxes.create(uid, 'Owned Box');
    await expect(
      lifecycle.requestDeletion(uid, 'wrong', verify),
    ).rejects.toMatchObject({ code: 'REAUTH_FAILED' });
    await expect(
      lifecycle.requestDeletion(uid, 'correct-password', verify),
    ).rejects.toMatchObject({ code: 'BOX_OWNERSHIP_TRANSFER_REQUIRED' });
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .update({ ownerUid: randomUUID() });
    const now = Date.now();
    const requested = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      now,
    );
    expect(requested.dueAt).toBe(
      new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    const otherOwner = await person();
    const otherBox = await boxes.create(otherOwner, 'Transfer Guard');
    await db
      .collection('nativeBoxes')
      .doc(otherBox.id)
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active' });
    await expect(
      boxes.transfer(otherBox.id, otherOwner, uid),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(boxes.create(uid, 'Too Late')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(await lifecycle.processDeletion(uid, now + 1000)).toBe('pending');
    await expect(
      lifecycle.cancelDeletion(
        uid,
        'correct-password',
        verify,
        now + 7 * 24 * 60 * 60 * 1000,
      ),
    ).rejects.toMatchObject({ code: 'WINDOW_CLOSED' });
    await lifecycle.cancelDeletion(
      uid,
      'correct-password',
      verify,
      now + 7 * 24 * 60 * 60 * 1000 - 1,
    );
    expect(
      await lifecycle.processDeletion(uid, now + 7 * 24 * 60 * 60 * 1000),
    ).toBe('complete');
    expect(
      (await db.collection('nativeAccounts').doc(uid).get()).get('status'),
    ).toBe('active');
  });

  it('restarts after every step and removes Auth, content, references and account', async () => {
    const uid = await person();
    const request = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      1_000,
    );
    const boxId = randomUUID(),
      postId = randomUUID(),
      commentId = randomUUID();
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .set({ status: 'active', ownerUid: randomUUID() });
    const post = db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts')
      .doc(postId);
    await post.set({
      boxId,
      authorUid: uid,
      text: 'erase me',
      status: 'active',
    });
    await db
      .collection('nativePostPointers')
      .doc(postId)
      .set({ boxId, authorUid: uid });
    const comment = post.collection('comments').doc(commentId);
    await comment.set({ postId, authorUid: uid, text: 'erase me' });
    await db
      .collection('nativeCommentPointers')
      .doc(commentId)
      .set({ boxId, postId, authorUid: uid });
    await db
      .collection('nativeFeedRefs')
      .doc(randomUUID())
      .collection('items')
      .doc(`p_${postId}`)
      .set({ authorUid: uid, postId });
    await db
      .collection('nativeFriendPairs')
      .doc(randomUUID())
      .set({ users: [uid, randomUUID()] });
    await db
      .collection('nativeNotifications')
      .doc(randomUUID())
      .collection('items')
      .doc(randomUUID())
      .set({ actorUid: uid });
    const reportRef = db.collection('nativeReports').doc(randomUUID());
    await reportRef.set({
      reporterUid: uid,
      status: 'closed',
      detail: 'private detail',
      reason: 'private reason',
    });
    const roomOwner = randomUUID();
    await db
      .collection('nativeRooms')
      .doc(roomOwner)
      .set({ topFriendIds: [uid], version: 1 });
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active' });
    await db.collection('nativeBoxes').doc(boxId).update({ memberCount: 2 });
    const keyRef = db
      .collection('nativeIdempotency')
      .doc(`lifeupdate_${uid}_${randomUUID()}`);
    await keyRef.set({ uid, expiresAt: Date.now() + 60_000 });
    const due = Date.parse(request.dueAt);
    const phases = await drain(uid, due);
    expect(phases).toContain('references');
    expect((await keyRef.get()).exists).toBe(false);
    expect((await post.get()).exists).toBe(false);
    expect((await comment.get()).exists).toBe(false);
    expect(
      (await db.collection('nativePostPointers').doc(postId).get()).exists,
    ).toBe(false);
    expect(
      (await db.collection('nativeCommentPointers').doc(commentId).get())
        .exists,
    ).toBe(false);
    expect((await db.collection('nativeAccounts').doc(uid).get()).exists).toBe(
      false,
    );
    expect(
      (await db.collection('nativeBoxes').doc(boxId).get()).get('memberCount'),
    ).toBe(1);
    expect(
      (await db.collection('nativeRooms').doc(roomOwner).get()).get(
        'topFriendIds',
      ),
    ).toEqual([]);
    await expect(auth.getUser(uid)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
    expect(
      (await db.collectionGroup('items').where('authorUid', '==', uid).get())
        .empty,
    ).toBe(true);
    expect(
      (await db.collectionGroup('items').where('actorUid', '==', uid).get())
        .empty,
    ).toBe(true);
    expect(
      (
        await db
          .collection('nativeFriendPairs')
          .where('users', 'array-contains', uid)
          .get()
      ).empty,
    ).toBe(true);
    expect((await reportRef.get()).get('reporterUid')).toBeNull();
    expect((await reportRef.get()).get('detail')).toBeNull();
    expect((await reportRef.get()).get('reason')).toBeNull();
  });

  it('retires media objects and private export bytes before removing identity', async () => {
    const uid = await person();
    const media = new NativeMedia(db, storage, bucketName);
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#eab678' },
    })
      .jpeg()
      .toBuffer();
    const asset = await media.reserve(uid, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(uid, asset.id, bytes, 'image/jpeg');
    await media.complete(uid, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    const assetRow = await db
      .collection('nativeMediaAssets')
      .doc(asset.id)
      .get();
    const mediaPath = (assetRow.get('objectPaths') as string[])[0]!;
    const archive = await lifecycle.requestExport(uid);
    const exportPath = (
      await db.collection('nativeExports').doc(archive.id).get()
    ).get('objectPath') as string;
    const request = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      1_000,
    );
    await drain(uid, Date.parse(request.dueAt));
    expect((await storage.bucket(bucketName).file(mediaPath).exists())[0]).toBe(
      false,
    );
    expect(
      (await storage.bucket(bucketName).file(exportPath).exists())[0],
    ).toBe(false);
    expect(
      (await db.collection('nativeMediaAssets').doc(asset.id).get()).exists,
    ).toBe(false);
    expect(
      (await db.collection('nativeExports').doc(archive.id).get()).exists,
    ).toBe(false);
  });

  it('repairs orphan export bytes after a worker crash', async () => {
    const uid = await person();
    const path = `private/exports/${uid}/${randomUUID()}.json`;
    const file = storage.bucket(bucketName).file(path);
    await file.save('{}', { contentType: 'application/json' });
    await lifecycle.repairExports();
    expect((await file.exists())[0]).toBe(false);
  });

  it('continues repairing other exports after one owner becomes unavailable', async () => {
    const unavailableUid = await person();
    const readyUid = await person();
    const badId = randomUUID();
    const goodId = randomUUID();
    const createdAt = Date.now();
    for (const [id, uid] of [
      [badId, unavailableUid],
      [goodId, readyUid],
    ] as const)
      await db
        .collection('nativeExports')
        .doc(id)
        .set({
          schemaVersion: 1,
          ownerUid: uid,
          status: 'pending',
          createdAt,
          readyAt: null,
          expiresAt: null,
          objectPath: `private/exports/${uid}/${id}.json`,
        });
    await db
      .collection('nativeAccounts')
      .doc(unavailableUid)
      .update({ status: 'suspended' });
    await lifecycle.repairExports();
    expect(
      (await db.collection('nativeExports').doc(badId).get()).get('attempts'),
    ).toBe(1);
    expect(
      (await db.collection('nativeExports').doc(goodId).get()).get('status'),
    ).toBe('ready');
  });

  it('resumes after an injected failure at every erasure boundary', async () => {
    const uid = await person();
    const request = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      1_000,
    );
    const expected = new Set([
      'pending',
      'media',
      'exports',
      'content',
      'references',
      'identity',
      'account',
    ]);
    const injected = new Set<string>();
    const failure = new Error('injected restart');
    const runner = new NativeAccountLifecycle(
      db,
      auth,
      storage,
      bucketName,
      (phase) => {
        if (expected.has(phase) && !injected.has(phase)) {
          injected.add(phase);
          throw failure;
        }
      },
    );
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await runner.processDeletion(uid, Date.parse(request.dueAt));
      } catch (error) {
        expect(error).toBe(failure);
      }
      if (
        !(await db.collection('nativeDeletionRequests').doc(uid).get()).exists
      )
        break;
    }
    expect(injected).toEqual(expected);
    expect((await db.collection('nativeAccounts').doc(uid).get()).exists).toBe(
      false,
    );
    await expect(auth.getUser(uid)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
  });

  it('reaps orphan export bytes across more than one Storage page', async () => {
    const uid = await person();
    const bucket = storage.bucket(bucketName);
    const files = Array.from({ length: 120 }, () =>
      bucket.file(`private/exports/${uid}/${randomUUID()}.json`),
    );
    await Promise.all(
      files.map((file) => file.save('{}', { contentType: 'application/json' })),
    );
    await lifecycle.reapOrphanExports();
    const remaining = await Promise.all(files.map((file) => file.exists()));
    expect(remaining.filter(([exists]) => exists)).toHaveLength(0);
  });

  it('erases every comment pointer of a post with more comments than one page', async () => {
    const uid = await person();
    const request = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      1_000,
    );
    const boxId = randomUUID(),
      postId = randomUUID();
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .set({ status: 'active', ownerUid: randomUUID() });
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts')
      .doc(postId)
      .set({ boxId, authorUid: uid, text: 'popular', status: 'active' });
    const batch = db.batch();
    const pointerIds = Array.from({ length: 120 }, () => randomUUID());
    for (const id of pointerIds)
      batch.set(db.collection('nativeCommentPointers').doc(id), {
        boxId,
        postId,
        authorUid: randomUUID(),
      });
    await batch.commit();
    await drain(uid, Date.parse(request.dueAt));
    const left = await db
      .collection('nativeCommentPointers')
      .where('postId', '==', postId)
      .get();
    expect(left.size).toBe(0);
  });

  it('keeps cancellation and erasure coherent when they race at the deadline', async () => {
    for (const cancelAtOffset of [-1, 0]) {
      const uid = await person();
      const boxId = randomUUID(),
        postId = randomUUID();
      await db
        .collection('nativeBoxes')
        .doc(boxId)
        .set({ status: 'active', ownerUid: randomUUID() });
      const post = db
        .collection('nativeBoxes')
        .doc(boxId)
        .collection('posts')
        .doc(postId);
      await post.set({
        boxId,
        authorUid: uid,
        text: 'must not be erased unless deletion completes',
        status: 'active',
      });
      const request = await lifecycle.requestDeletion(
        uid,
        'correct-password',
        verify,
        1_000,
      );
      const due = Date.parse(request.dueAt);
      const [cancelled, processed] = await Promise.allSettled([
        lifecycle.cancelDeletion(
          uid,
          'correct-password',
          verify,
          due + cancelAtOffset,
        ),
        lifecycle.processDeletion(uid, due),
      ]);
      const requestRow = db.collection('nativeDeletionRequests').doc(uid);
      const status = (await requestRow.get()).get('status') as string;
      const accountStatus = (
        await db.collection('nativeAccounts').doc(uid).get()
      ).get('status') as string;
      if (cancelAtOffset === 0) {
        expect(cancelled.status).toBe('rejected');
        expect((cancelled as PromiseRejectedResult).reason).toMatchObject({
          code: 'WINDOW_CLOSED',
        });
      }
      if (status === 'cancelled') {
        expect(cancelled.status).toBe('fulfilled');
        expect(accountStatus).toBe('active');
        expect((await post.get()).exists).toBe(true);
        await auth.getUser(uid);
        expect(await lifecycle.processDeletion(uid, due + 1)).toBe('complete');
        expect((await post.get()).exists).toBe(true);
        expect(
          (await db.collection('nativeAccounts').doc(uid).get()).get('status'),
        ).toBe('active');
      } else {
        expect(cancelled.status).toBe('rejected');
        expect(processed.status).toBe('fulfilled');
        expect(accountStatus).toBe('deleting');
        await drain(uid, due);
        expect((await post.get()).exists).toBe(false);
        expect(
          (await db.collection('nativeAccounts').doc(uid).get()).exists,
        ).toBe(false);
        await expect(auth.getUser(uid)).rejects.toMatchObject({
          code: 'auth/user-not-found',
        });
      }
    }
  });

  it('does nothing when erasure steps carry a cancelled request generation', async () => {
    const uid = await person();
    const first = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      1_000,
    );
    const staleGeneration = first.id;
    await lifecycle.cancelDeletion(uid, 'correct-password', verify, 2_000);
    const second = await lifecycle.requestDeletion(
      uid,
      'correct-password',
      verify,
      3_000,
    );
    expect(second.id).not.toBe(staleGeneration);
    const survivorId = randomUUID(),
      boxId = randomUUID();
    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .set({ status: 'active', ownerUid: randomUUID() });
    const survivor = db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('posts')
      .doc(survivorId);
    await survivor.set({ boxId, authorUid: uid, status: 'active', text: 'x' });
    // Move the second generation into a running phase so only the generation differs.
    expect(await lifecycle.processDeletion(uid, Date.parse(second.dueAt))).toBe(
      'media',
    );
    const requestRef = db.collection('nativeDeletionRequests').doc(uid);
    const before = await requestRef.get();
    expect(before.get('generation')).toBe(second.id);
    expect(before.get('phase')).toBe('media');
    type Internals = {
      advance(
        uid: string,
        generation: string,
        from: string,
        to: string,
      ): Promise<void>;
      assertGeneration(
        uid: string,
        generation: string,
        phase: string,
      ): Promise<void>;
      erasePage(
        uid: string,
        generation: string,
        phase: string,
        query: FirebaseFirestore.Query,
      ): Promise<number>;
    };
    const internals = lifecycle as unknown as Internals;
    await expect(
      internals.assertGeneration(uid, staleGeneration, 'media'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      internals.advance(uid, staleGeneration, 'media', 'exports'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      internals.erasePage(
        uid,
        staleGeneration,
        'media',
        db
          .collection('nativeBoxes')
          .doc(boxId)
          .collection('posts')
          .where('authorUid', '==', uid),
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect((await survivor.get()).exists).toBe(true);
    const after = await requestRef.get();
    expect(after.get('phase')).toBe('media');
    expect(after.get('generation')).toBe(second.id);
    expect(after.get('updatedAt')).toBe(before.get('updatedAt'));
  });
});
