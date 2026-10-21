import { mediaAssets, mediaJobOutbox } from '@paldora/database';
import { MemoryObjectStorage } from '@paldora/storage';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { derivativeKeys } from './media/process-media.js';
import { connectTestDatabase } from './test-support/database.js';
import {
  assetRow,
  drainDeletions,
  fakeJob,
  objectsOf,
} from './test-support/media.js';
import { pipelineTools } from './test-support/pipeline.js';

/** Derivatives per purpose: sizes, metadata stripping, and cleanup. */
const { database } = connectTestDatabase('paldora-pipeline-test');
const { worker, queuedPhoto } = pipelineTools(database);

describe('processing a post photo', () => {
  it('writes bounded, metadata-free derivatives and removes the raw upload', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    await run(fakeJob(outbox));

    const ready = await assetRow(database, asset.id);
    expect(ready).toMatchObject({
      status: 'ready',
      ...derivativeKeys(asset.id),
    });
    const keys = derivativeKeys(asset.id);
    const sizes = await Promise.all(
      [
        keys.masterObjectKey,
        keys.displayObjectKey,
        keys.thumbnailObjectKey,
      ].map(async (key) => {
        const stored = storage.objects.get(key);
        const metadata = await sharp(stored?.body).metadata();
        expect(metadata.exif).toBeUndefined();
        return Math.max(metadata.width ?? 0, metadata.height ?? 0);
      }),
    );
    expect(sizes).toEqual([2560, 1600, 640]);
    expect(ready).toMatchObject({ width: 2560, height: 1707 });

    await drainDeletions(database, run);
    expect(objectsOf(storage, asset).sort()).toEqual(
      Object.values(keys).sort(),
    );
  });
});

describe('processing a camera capture', () => {
  it('uses the reaction_image sizes and waits, unattached, for its reaction', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(
      storage,
      undefined,
      'reaction_image',
    );
    await run(fakeJob(outbox));

    const ready = await assetRow(database, asset.id);
    expect(ready).toMatchObject({
      status: 'ready',
      width: 1280,
      height: 853,
      ...derivativeKeys(asset.id),
    });
    const keys = derivativeKeys(asset.id);
    const sizes = await Promise.all(
      [
        keys.masterObjectKey,
        keys.displayObjectKey,
        keys.thumbnailObjectKey,
      ].map(async (key) => {
        const metadata = await sharp(storage.objects.get(key)?.body).metadata();
        expect(metadata.exif).toBeUndefined();
        return Math.max(metadata.width ?? 0, metadata.height ?? 0);
      }),
    );
    expect(sizes).toEqual([1280, 1024, 320]);
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset).sort()).toEqual(
      Object.values(keys).sort(),
    );
  });

  it('leaves nothing behind when its Box is deleted mid-processing', async () => {
    const storage = new MemoryObjectStorage();
    const { asset, outbox } = await queuedPhoto(
      storage,
      undefined,
      'reaction_image',
    );
    const originalWrite = storage.write.bind(storage);
    let written = 0;
    storage.write = async (key, type, body) => {
      await originalWrite(key, type, body);
      written += 1;
      if (written === 2) {
        // Box deletion retires its camera captures by box_id, like photos.
        await database
          .update(mediaAssets)
          .set({ status: 'deleted' })
          .where(eq(mediaAssets.id, asset.id));
        await database.insert(mediaJobOutbox).values({
          jobType: 'media.delete',
          payload: { objectKeys: [asset.uploadObjectKey] },
        });
      }
    };
    const { run } = worker(storage);
    await run(fakeJob(outbox));
    expect((await assetRow(database, asset.id))?.status).toBe('deleted');
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });
});

describe('processing a Life Update photo', () => {
  it('uses the post photo sizes, needs no Box, and waits unattached', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(
      storage,
      undefined,
      'life_update_image',
    );
    expect(asset.boxId).toBeNull();
    await run(fakeJob(outbox));
    const ready = await assetRow(database, asset.id);
    expect(ready).toMatchObject({
      status: 'ready',
      boxId: null,
      width: 2560,
      height: 1707,
      ...derivativeKeys(asset.id),
    });
    const keys = derivativeKeys(asset.id);
    const sizes = await Promise.all(
      [
        keys.masterObjectKey,
        keys.displayObjectKey,
        keys.thumbnailObjectKey,
      ].map(async (key) => {
        const metadata = await sharp(storage.objects.get(key)?.body).metadata();
        expect(metadata.exif).toBeUndefined();
        return Math.max(metadata.width ?? 0, metadata.height ?? 0);
      }),
    );
    expect(sizes).toEqual([2560, 1600, 640]);
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset).sort()).toEqual(
      Object.values(keys).sort(),
    );
  });
});

describe('processing a Room banner', () => {
  it('writes a whole master and exact 3:1 covers, metadata-free, and waits unattached', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(
      storage,
      undefined,
      'room_banner',
    );
    expect(asset.boxId).toBeNull();
    await run(fakeJob(outbox));
    const ready = await assetRow(database, asset.id);
    expect(ready).toMatchObject({
      status: 'ready',
      boxId: null,
      width: 2560,
      height: 1707,
      ...derivativeKeys(asset.id),
    });
    const keys = derivativeKeys(asset.id);
    const sizes = await Promise.all(
      [
        keys.masterObjectKey,
        keys.displayObjectKey,
        keys.thumbnailObjectKey,
      ].map(async (key) => {
        const metadata = await sharp(storage.objects.get(key)?.body).metadata();
        expect(metadata.format).toBe('webp');
        expect(metadata.exif).toBeUndefined();
        return [metadata.width, metadata.height];
      }),
    );
    expect(sizes).toEqual([
      [2560, 1707],
      [1600, 533],
      [640, 213],
    ]);
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset).sort()).toEqual(
      Object.values(keys).sort(),
    );
  });
});
