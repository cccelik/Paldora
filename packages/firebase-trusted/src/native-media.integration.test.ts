import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeMedia } from './native-media.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeLifeUpdates } from './native-life-updates.js';
import { NativeRooms } from './native-rooms.js';
import { NativeModeration } from './native-moderation.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Auth, Firestore and Storage emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `media-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const bucketName = 'demo-paldora.firebasestorage.app';
const bucket = storage.bucket(bucketName);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const media = new NativeMedia(db, storage, bucketName);
afterAll(() => deleteApp(app));

function mediaWithSaveHook(hook: (path: string) => Promise<void>): NativeMedia {
  const intercepted = {
    bucket: () => ({
      file: (path: string) => {
        const original = bucket.file(path);
        return {
          save: async (...args: Parameters<typeof original.save>) => {
            await original.save(...args);
            await hook(path);
          },
          delete: original.delete.bind(original),
          download: original.download.bind(original),
        };
      },
      getFiles: bucket.getFiles.bind(bucket),
    }),
  } as unknown as Storage;
  return new NativeMedia(db, intercepted, bucketName);
}

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

async function image() {
  return sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: '#f0bc73',
    },
  })
    .jpeg()
    .toBuffer();
}

describe('private native media lifecycle', () => {
  it('processes metadata-free derivatives and retires raw and all derivatives', async () => {
    const owner = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    const rawPath = (
      await db.collection('nativeMediaAssets').doc(asset.id).get()
    ).get('rawPath') as string;
    const abandonedPath = `${rawPath.slice(0, -4)}/e0/abandoned/display.webp`;
    await bucket.file(abandonedPath).save(bytes);
    await media.processOnce(`media-process-${asset.id}-0`);
    expect((await media.status(owner, asset.id)).status).toBe('ready');
    const displayed = await media.read(owner, asset.id, 'display');
    expect((await sharp(displayed).metadata()).format).toBe('webp');
    const saved = await db.collection('nativeMediaAssets').doc(asset.id).get();
    expect(saved.get('objectPaths')).toHaveLength(3);
    expect(
      (await bucket.file(saved.get('rawPath') as string).exists())[0],
    ).toBe(false);
    expect((await bucket.file(abandonedPath).exists())[0]).toBe(false);
    const other = await user();
    await expect(media.read(other, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const paths = saved.get('objectPaths') as string[];
    await media.retire(asset.id);
    await expect(media.read(owner, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    for (const path of paths)
      expect((await bucket.file(path).exists())[0]).toBe(false);
  });

  it('rejects wrong bytes and cannot republish after a deletion wins', async () => {
    const owner = await user();
    const bytes = await image();
    const invalid = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await expect(
      media.upload(owner, invalid.id, Buffer.alloc(bytes.length), 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect((await media.status(owner, invalid.id)).status).toBe('failed');
    const valid = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, valid.id, bytes, 'image/jpeg');
    await media.complete(owner, valid.id);
    await media.retire(valid.id);
    await media.processOnce(`media-process-${valid.id}-0`);
    expect((await media.status(owner, valid.id)).status).toBe('deleted');
    expect(
      (await db.collection('nativeMediaAssets').doc(valid.id).get()).get(
        'objectPaths',
      ),
    ).toEqual([]);
  });

  it('requires a current Box member for a Box-scoped reservation', async () => {
    const owner = await user();
    const stranger = await user();
    const box = await boxes.create(owner, 'Private Photos');
    const bytes = await image();
    await expect(
      media.reserve(stranger, {
        purpose: 'post_image',
        boxId: box.id,
        contentType: 'image/jpeg',
        contentLength: bytes.length,
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const own = await media.reserve(owner, {
      purpose: 'post_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await expect(
      media.upload(stranger, own.id, bytes, 'image/jpeg'),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('attaches a ready Box photo once and closes its old route on post deletion', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Photo Box');
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'post_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    const posts = new NativeBoxPosts(db);
    const postId = await posts.create(box.id, owner, '', Date.now(), [
      asset.id,
    ]);
    expect((await posts.get(box.id, postId, owner)).mediaAssetIds).toEqual([
      asset.id,
    ]);
    await expect(
      posts.create(box.id, owner, '', Date.now(), [asset.id]),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(
      (await media.read(owner, asset.id, 'thumbnail')).length,
    ).toBeGreaterThan(0);
    const retiredIds = await posts.remove(box.id, postId, owner);
    await Promise.all(retiredIds.map((id) => media.retire(id)));
    await expect(
      media.read(owner, asset.id, 'thumbnail'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(
      (await db.collection('nativeMediaAssets').doc(asset.id).get()).get(
        'objectPaths',
      ),
    ).toEqual([]);
  });

  it('closes a reported post before retiring its media and finishing the takedown', async () => {
    const owner = await user();
    const staff = await user();
    await db
      .collection('nativeStaffGrants')
      .doc(staff)
      .set({ status: 'active' });
    const box = await boxes.create(owner, 'Reported Photo Box');
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'post_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    const posts = new NativeBoxPosts(db);
    const postId = await posts.create(box.id, owner, '', Date.now(), [
      asset.id,
    ]);
    const displayed = (
      await db.collection('nativeMediaAssets').doc(asset.id).get()
    ).get('objectPaths') as string[];
    const moderation = new NativeModeration(db);
    const report = await moderation.createReport(owner, {
      targetKind: 'post',
      targetId: postId,
      category: 'privacy',
      detail: 'Please remove this image',
    });
    await moderation.actOnCase(staff, report.id, {
      action: 'hide',
      reason: 'The reported image must be removed from this Box.',
      idempotencyKey: randomUUID(),
    });
    await expect(media.read(owner, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    for (let attempt = 0; attempt < 3; attempt += 1)
      if (
        (await media.cleanupPost(`media-post-cleanup-${postId}`)) === 'complete'
      )
        break;
    expect(
      (
        await db
          .collection('nativeJobs')
          .doc(`media-post-cleanup-${postId}`)
          .get()
      ).get('status'),
    ).toBe('complete');
    for (const path of displayed)
      expect((await bucket.file(path).exists())[0]).toBe(false);
  });

  it('claims a processing job once when trigger and repair run concurrently', async () => {
    const owner = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    const jobId = `media-process-${asset.id}-0`;
    await Promise.all([media.processOnce(jobId), media.processOnce(jobId)]);
    expect((await media.status(owner, asset.id)).status).toBe('ready');
    const saved = await db.collection('nativeMediaAssets').doc(asset.id).get();
    expect(saved.get('objectPaths')).toHaveLength(3);
    expect(
      (await db.collection('nativeJobs').doc(jobId).get()).get('status'),
    ).toBe('complete');
  });

  it('repairs a failed derivative write and sweeps its abandoned attempt', async () => {
    const owner = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    let failed = false;
    const interrupted = mediaWithSaveHook(async (path) => {
      if (!failed && path.endsWith('/display.webp')) {
        failed = true;
        throw new Error('injected derivative write failure');
      }
    });
    const jobId = `media-process-${asset.id}-0`;
    await expect(interrupted.processOnce(jobId)).rejects.toThrow('injected');
    expect(
      (await db.collection('nativeJobs').doc(jobId).get()).get('status'),
    ).toBe('pending');
    await media.processOnce(jobId);
    expect((await media.status(owner, asset.id)).status).toBe('ready');
    const saved = await db.collection('nativeMediaAssets').doc(asset.id).get();
    const [files] = await bucket.getFiles({
      prefix: `${(saved.get('rawPath') as string).slice(0, -4)}/`,
    });
    expect(files.map((file) => file.name).sort()).toEqual(
      (saved.get('objectPaths') as string[]).sort(),
    );
  });

  it('replays an explicitly selected dead media job without changing its epoch', async () => {
    const owner = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    const jobId = `media-process-${asset.id}-0`;
    await db
      .collection('nativeJobs')
      .doc(jobId)
      .update({ status: 'dead', attempts: 5 });
    await media.retryDead(jobId);
    expect((await media.status(owner, asset.id)).status).toBe('ready');
    const job = await db.collection('nativeJobs').doc(jobId).get();
    expect(job.get('status')).toBe('complete');
    expect(job.get('attempts')).toBe(0);
    await expect(media.retryDead(jobId)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('repairs a pending process intent and expires an unattached reservation', async () => {
    const owner = await user();
    const bytes = await image();
    const processAsset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, processAsset.id, bytes, 'image/jpeg');
    await media.complete(owner, processAsset.id);
    expect(await media.repairPending()).toBeGreaterThan(0);
    expect((await media.status(owner, processAsset.id)).status).toBe('ready');

    const stale = await media.reserve(
      owner,
      {
        purpose: 'room_banner',
        contentType: 'image/jpeg',
        contentLength: bytes.length,
      },
      Date.now() - 2 * 60 * 60_000,
    );
    expect(await media.expireUnattached()).toBeGreaterThan(0);
    expect((await media.status(owner, stale.id)).status).toBe('deleted');
  });

  it('does not publish a derivative after deletion wins a running processor race', async () => {
    const owner = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'avatar',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const delayed = mediaWithSaveHook(async (path) => {
      if (path.endsWith('/display.webp')) {
        entered();
        await blocked;
      }
    });
    const jobId = `media-process-${asset.id}-0`;
    const processing = delayed.processOnce(jobId);
    await writing;
    await expect(media.retire(asset.id)).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });
    release();
    await processing;
    await media.retire(asset.id);
    expect(
      (await db.collection('nativeJobs').doc(jobId).get()).get('status'),
    ).toBe('complete');
    await expect(media.read(owner, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const saved = await db.collection('nativeMediaAssets').doc(asset.id).get();
    const [files] = await bucket.getFiles({
      prefix: `${(saved.get('rawPath') as string).slice(0, -4)}/`,
    });
    expect(files).toHaveLength(0);
  });

  it('stores one owner-scoped Life Update photo and retires it on removal', async () => {
    const owner = await user();
    const other = await user();
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'life_update_image',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    const updates = new NativeLifeUpdates(db);
    const id = await updates.create(owner, {
      audience: { type: 'only_me' },
      sections: { lifeLately: 'A private day' },
      mediaAssetIds: [asset.id],
    });
    expect((await updates.get(id, owner)).mediaAssetIds).toEqual([asset.id]);
    await expect(media.read(other, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(
      (await media.read(owner, asset.id, 'display')).length,
    ).toBeGreaterThan(0);
    const retired = await updates.remove(id, owner);
    await Promise.all(retired.map((mediaId) => media.retire(mediaId)));
    await expect(media.read(owner, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('claims one camera reaction and retires its image when replaced by an emoji', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Camera Box');
    const posts = new NativeBoxPosts(db);
    const postId = await posts.create(box.id, owner, 'Camera test');
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'reaction_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    expect(
      await posts.setReaction(box.id, postId, owner, 'real', {
        mediaAssetId: asset.id,
      }),
    ).toBeNull();
    expect(
      (await posts.interactionSummary(box.id, postId, owner)).realCount,
    ).toBe(1);
    expect(
      (await media.read(owner, asset.id, 'thumbnail')).length,
    ).toBeGreaterThan(0);
    const previous = await posts.setReaction(box.id, postId, owner, '🙂');
    expect(previous).toBe(asset.id);
    await media.retire(previous!);
    expect(
      (await posts.interactionSummary(box.id, postId, owner)).realCount,
    ).toBe(0);
    await expect(
      media.read(owner, asset.id, 'thumbnail'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('claims a ready Room banner and rejects an unattached visitor read', async () => {
    const owner = await user();
    await db
      .collection('nativeAccounts')
      .doc(owner)
      .update({ username: `banner_${owner.slice(0, 8)}` });
    await db
      .collection('nativeUsernames')
      .doc(`banner_${owner.slice(0, 8)}`)
      .set({ uid: owner });
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'room_banner',
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    await media.processOnce(`media-process-${asset.id}-0`);
    const rooms = new NativeRooms(db);
    await rooms.update(owner, {
      bannerMediaId: asset.id,
      expectedUpdatedAt: null,
    });
    expect(
      (await media.read(owner, asset.id, 'display')).length,
    ).toBeGreaterThan(0);
    const visitor = await user();
    await expect(
      media.read(visitor, asset.id, 'display'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('leaves no readable or stored derivative when a moderation hide lands between publish and raw retirement', async () => {
    // An asset can only attach to a post once it is ready, so the earliest
    // moment a post can exist for a processing job is right after publish.
    const owner = await user();
    const staff = await user();
    await db
      .collection('nativeStaffGrants')
      .doc(staff)
      .set({ status: 'active' });
    const box = await boxes.create(owner, 'Hide During Processing');
    const bytes = await image();
    const asset = await media.reserve(owner, {
      purpose: 'post_image',
      boxId: box.id,
      contentType: 'image/jpeg',
      contentLength: bytes.length,
    });
    await media.upload(owner, asset.id, bytes, 'image/jpeg');
    await media.complete(owner, asset.id);
    const assetRef = db.collection('nativeMediaAssets').doc(asset.id);
    const rawPath = (await assetRef.get()).get('rawPath') as string;
    const jobId = `media-process-${asset.id}-0`;
    const posts = new NativeBoxPosts(db);
    const moderation = new NativeModeration(db);
    let postId = '';
    let published: string[] = [];
    let hidden = false;
    const hideWhilePublishing = async () => {
      published = Object.values(
        (await assetRef.get()).get('derivativeObjectPaths') as Record<
          string,
          string
        >,
      );
      postId = await posts.create(box.id, owner, '', Date.now(), [asset.id]);
      const report = await moderation.createReport(owner, {
        targetKind: 'post',
        targetId: postId,
        category: 'privacy',
        detail: 'Please remove this image',
      });
      await moderation.actOnCase(staff, report.id, {
        action: 'hide',
        reason: 'The reported image must be removed from this Box.',
        idempotencyKey: randomUUID(),
      });
      // The running processor lease must make premature retirement fail closed.
      await media
        .cleanupPost(`media-post-cleanup-${postId}`)
        .catch(() => undefined);
    };
    const intercepted = {
      bucket: () => ({
        file: (path: string) => {
          const original = bucket.file(path);
          return {
            save: original.save.bind(original),
            download: original.download.bind(original),
            delete: async (...args: Parameters<typeof original.delete>) => {
              if (path === rawPath && !hidden) {
                hidden = true;
                await hideWhilePublishing();
              }
              return original.delete(...args);
            },
          };
        },
        getFiles: bucket.getFiles.bind(bucket),
      }),
    } as unknown as Storage;
    const processor = new NativeMedia(db, intercepted, bucketName);
    await processor.processOnce(jobId);
    expect(hidden).toBe(true);
    expect(published).toHaveLength(3);
    await expect(media.read(owner, asset.id, 'display')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    // Reclaim the epoch-stale processor lease the way the repair loop does.
    const later = Date.now() + 16 * 60_000;
    await media.processOnce(jobId, later);
    for (let attempt = 0; attempt < 5; attempt += 1)
      if (
        (await media.cleanupPost(`media-post-cleanup-${postId}`, later)) ===
        'complete'
      )
        break;
    expect(
      (
        await db
          .collection('nativeJobs')
          .doc(`media-post-cleanup-${postId}`)
          .get()
      ).get('status'),
    ).toBe('complete');
    await expect(
      media.read(owner, asset.id, 'thumbnail'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    for (const path of published)
      expect((await bucket.file(path).exists())[0]).toBe(false);
    const [left] = await bucket.getFiles({
      prefix: `${rawPath.slice(0, -4)}/`,
    });
    expect(left).toHaveLength(0);
    expect((await assetRef.get()).get('objectPaths')).toEqual([]);
  });
});
