import { requireEnvironmentVariables } from '@paldora/config';
import {
  boxMemberships,
  boxes,
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  mediaProcessJob,
  postMedia,
  postReactions,
  posts,
  profiles,
  users,
  type MediaJobOutboxRow,
} from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { MemoryObjectStorage } from '@paldora/storage';
import type { Job, Queue } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createJobRouter } from './job-router.js';
import { createJobHandlers } from './jobs.js';
import {
  DEAD_RETRY_AFTER_MS,
  MAX_DELETE_ATTEMPTS,
  OUTBOX_RETENTION_MS,
  reap,
} from './maintenance/reaper.js';
import { derivativeKeys } from './media/process-media.js';
import { dispatchOnce } from './outbox/dispatcher.js';
import { recordJobFailure } from './outbox/failures.js';
import { CLAIM_LEASE_MS } from './outbox/outbox-store.js';

const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 6,
  applicationName: 'paldora-pipeline-test',
});
const database = connection.database;
const logger = createLogger({
  service: 'worker',
  environment: 'test',
  level: 'silent',
});
afterAll(() => connection.close());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Storage plus a handler router, as one isolated worker would run. */
function worker(storage = new MemoryObjectStorage()) {
  const run = createJobRouter(createJobHandlers({ database, storage }), {
    logger,
  });
  return { storage, run };
}

const fakeJob = (row: Pick<MediaJobOutboxRow, 'id' | 'jobType'>) =>
  ({ id: row.id, name: row.jobType, data: { outboxId: row.id } }) as Job;

async function person() {
  const email = `pipe-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({ authSubject: `s-${randomUUID()}`, email, emailNormalized: email })
    .returning({ id: users.id });
  await database.insert(profiles).values({ userId: user!.id });
  return user!.id;
}

async function boxOf(ownerId: string) {
  const [box] = await database
    .insert(boxes)
    .values({ name: 'Pipeline' })
    .returning({ id: boxes.id });
  await database
    .insert(boxMemberships)
    .values({ boxId: box!.id, userId: ownerId, role: 'owner' });
  return box!.id;
}

async function bigJpeg() {
  return new Uint8Array(
    await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#b86' },
    })
      .withMetadata({ orientation: 1 })
      .withExifMerge({
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 31/1 0/1' },
      })
      .jpeg()
      .toBuffer(),
  );
}

/** A reserved, completed upload waiting for the worker. */
async function queuedPhoto(
  storage: MemoryObjectStorage,
  bytes?: Uint8Array,
  purpose: 'post_image' | 'reaction_image' = 'post_image',
) {
  const ownerId = await person();
  const boxId = await boxOf(ownerId);
  const body = bytes ?? (await bigJpeg());
  const uploadObjectKey = `uploads/${randomUUID()}`;
  storage.put(uploadObjectKey, 'image/jpeg', body);
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ownerUserId: ownerId,
      boxId,
      purpose,
      status: 'processing',
      contentType: 'image/jpeg',
      contentLength: body.byteLength,
      uploadObjectKey,
      uploadExpiresAt: new Date(Date.now() + 300_000),
    })
    .returning();
  const [outbox] = await database
    .insert(mediaJobOutbox)
    .values(mediaProcessJob(asset!.id))
    .returning();
  return { asset: asset!, outbox: outbox!, ownerId, boxId };
}

/** Runs every queued deletion job, the way the worker would. */
async function drainDeletions(run: ReturnType<typeof worker>['run']) {
  const rows = await database
    .select()
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        eq(mediaJobOutbox.status, 'pending'),
      ),
    );
  for (const row of rows) {
    // Sequential, like one worker draining its queue.
    await run(fakeJob(row));
  }
}

const assetRow = async (id: string) =>
  (await database.select().from(mediaAssets).where(eq(mediaAssets.id, id)))[0];

/** Storage objects that belong to an asset (its upload and its derivatives). */
function objectsOf(
  storage: MemoryObjectStorage,
  asset: { id: string; uploadObjectKey: string },
) {
  return [...storage.objects.keys()].filter(
    (key) =>
      key === asset.uploadObjectKey || key.startsWith(`media/${asset.id}/`),
  );
}

describe('processing a post photo', () => {
  it('writes bounded, metadata-free derivatives and removes the raw upload', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    await run(fakeJob(outbox));

    const ready = await assetRow(asset.id);
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

    await drainDeletions(run);
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

    const ready = await assetRow(asset.id);
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
    await drainDeletions(run);
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
    expect((await assetRow(asset.id))?.status).toBe('deleted');
    await drainDeletions(run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });
});

describe('fault injection: no orphaned objects', () => {
  it('survives a storage failure halfway through writing derivatives', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    storage.failNext(); // the first write fails; the others may land
    await expect(run(fakeJob(outbox))).rejects.toThrow(/storage unavailable/);
    expect((await assetRow(asset.id))?.status).toBe('processing');

    await run(fakeJob(outbox)); // BullMQ's retry
    expect((await assetRow(asset.id))?.status).toBe('ready');
    await drainDeletions(run);
    expect(objectsOf(storage, asset).sort()).toEqual(
      Object.values(derivativeKeys(asset.id)).sort(),
    );
  });

  it('cleans everything up when retries are exhausted', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    const job = {
      ...fakeJob(outbox),
      attemptsMade: 5,
      opts: { attempts: 5 },
    } as Job;
    storage.failNext(1);
    await expect(run(fakeJob(outbox))).rejects.toThrow();
    await recordJobFailure(database, logger, job, new Error('storage 503'));

    expect(await assetRow(asset.id)).toMatchObject({
      status: 'failed',
      failureReason: 'processing_exhausted',
    });
    await drainDeletions(run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });

  it('keeps deletion intent when Redis is down and delivers it later', async () => {
    const { storage } = worker();
    const { outbox } = await queuedPhoto(storage);
    await database
      .update(mediaJobOutbox)
      // Earlier than any leftover row, including one an interrupted earlier
      // run of this test left behind: each run picks an earlier instant.
      .set({ availableAt: new Date(-Date.now()) })
      .where(eq(mediaJobOutbox.id, outbox.id));

    const down = {
      addBulk: vi.fn().mockRejectedValue(new Error('redis down')),
    } as unknown as Queue;
    await expect(dispatchOnce(database, down, 1)).rejects.toThrow('redis down');
    const [stuck] = await database
      .select()
      .from(mediaJobOutbox)
      .where(eq(mediaJobOutbox.id, outbox.id));
    expect(stuck?.status).toBe('pending');

    // The claim lease lapses; Redis returns; the same row goes out exactly once.
    await database
      .update(mediaJobOutbox)
      .set({ claimedAt: new Date(Date.now() - CLAIM_LEASE_MS - 1_000) })
      .where(eq(mediaJobOutbox.id, outbox.id));
    const sent: string[] = [];
    const up = {
      addBulk: vi.fn(async (jobs: { opts?: { jobId?: string } }[]) => {
        sent.push(...jobs.map((job) => job.opts?.jobId ?? ''));
        return [];
      }),
    } as unknown as Queue;
    await dispatchOnce(database, up, 1);
    expect(sent).toEqual([outbox.id]);
    const [done] = await database
      .select()
      .from(mediaJobOutbox)
      .where(eq(mediaJobOutbox.id, outbox.id));
    expect(done?.status).toBe('published');
  });

  it('leaves nothing behind when the Box is deleted before processing starts', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    // What the API does on Box deletion: tombstone the asset, queue deletion.
    await database
      .update(mediaAssets)
      .set({ status: 'deleted' })
      .where(eq(mediaAssets.id, asset.id));
    await database.insert(mediaJobOutbox).values({
      jobType: 'media.delete',
      payload: { objectKeys: [asset.uploadObjectKey] },
    });

    await run(fakeJob(outbox));
    expect((await assetRow(asset.id))?.status).toBe('deleted');
    await drainDeletions(run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });

  it('removes derivatives that were written just before the Box was deleted', async () => {
    const storage = new MemoryObjectStorage();
    const { asset, outbox } = await queuedPhoto(storage);
    const originalWrite = storage.write.bind(storage);
    let written = 0;
    storage.write = async (key, type, body) => {
      await originalWrite(key, type, body);
      written += 1;
      if (written === 3) {
        // The Box is deleted after the last derivative lands, before "ready".
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
    expect((await assetRow(asset.id))?.status).toBe('deleted');
    await drainDeletions(run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });
});

describe('reaper', () => {
  async function readyPhoto(
    ageMs: number,
    attached = false,
    purpose: 'post_image' | 'reaction_image' = 'post_image',
    at = new Date(Date.now() - ageMs),
  ) {
    const ownerId = await person();
    const boxId = await boxOf(ownerId);
    const id = randomUUID();
    const when = at;
    const keys = derivativeKeys(id);
    const [asset] = await database
      .insert(mediaAssets)
      .values({
        id,
        ownerUserId: ownerId,
        boxId,
        purpose,
        status: 'ready',
        contentType: 'image/jpeg',
        contentLength: 10,
        uploadObjectKey: `uploads/${id}`,
        uploadExpiresAt: when,
        width: 10,
        height: 10,
        ...keys,
        createdAt: when,
        updatedAt: when,
      })
      .returning();
    if (attached) {
      const [post] = await database
        .insert(posts)
        .values({ boxId, authorUserId: ownerId, content: 'x' })
        .returning();
      await (purpose === 'post_image'
        ? database
            .insert(postMedia)
            .values({ postId: post!.id, mediaAssetId: id, position: 0 })
        : database.insert(postReactions).values({
            postId: post!.id,
            userId: ownerId,
            kind: 'real',
            mediaAssetId: id,
          }));
    }
    return asset!;
  }

  it('removes ready photos nobody claimed within a day, and only those', async () => {
    const stale = await readyPhoto(2 * DAY);
    const fresh = await readyPhoto(HOUR);
    const kept = await readyPhoto(2 * DAY, true);
    const result = await reap(database);
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect((await assetRow(stale.id))?.status).toBe('deleted');
    expect((await assetRow(fresh.id))?.status).toBe('ready');
    expect((await assetRow(kept.id))?.status).toBe('ready');
    const jobs = await database
      .select()
      .from(mediaJobOutbox)
      .where(
        sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${stale.masterObjectKey}`,
      );
    expect(jobs).toHaveLength(1);
  });

  it('removes camera captures no reaction claimed, with zero orphaned objects', async () => {
    const { storage, run } = worker();
    // Earlier than any leftover row (each run picks an earlier instant), so
    // this run's reap reaches it whatever older test data exists.
    const stale = await readyPhoto(
      2 * DAY,
      false,
      'reaction_image',
      new Date(-Date.now()),
    );
    const fresh = await readyPhoto(HOUR, false, 'reaction_image');
    const kept = await readyPhoto(2 * DAY, true, 'reaction_image');
    for (const asset of [stale, fresh, kept]) {
      for (const key of Object.values(derivativeKeys(asset.id))) {
        storage.put(key, 'image/webp', new Uint8Array([1]));
      }
    }
    const result = await reap(database);
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect((await assetRow(stale.id))?.status).toBe('deleted');
    expect((await assetRow(fresh.id))?.status).toBe('ready');
    expect((await assetRow(kept.id))?.status).toBe('ready');
    await drainDeletions(run);
    expect(objectsOf(storage, stale)).toEqual([]);
    for (const asset of [fresh, kept]) {
      expect(objectsOf(storage, asset).sort()).toEqual(
        Object.values(derivativeKeys(asset.id)).sort(),
      );
    }
  });

  async function deadDeletion(attempts: number, ageMs: number) {
    const [row] = await database
      .insert(mediaJobOutbox)
      .values({
        jobType: 'media.delete',
        payload: { objectKeys: [`media/${randomUUID()}/x.webp`] },
        status: 'dead',
        attempts,
        updatedAt: new Date(Date.now() - ageMs),
      })
      .returning();
    return row!.id;
  }

  const statusOf = async (id: string) =>
    (
      await database
        .select()
        .from(mediaJobOutbox)
        .where(eq(mediaJobOutbox.id, id))
    )[0]?.status;

  it('retries dead deletions after a while, up to a limit', async () => {
    const due = await deadDeletion(5, DEAD_RETRY_AFTER_MS + HOUR);
    const tooRecent = await deadDeletion(5, 60_000);
    const exhausted = await deadDeletion(
      MAX_DELETE_ATTEMPTS,
      DEAD_RETRY_AFTER_MS + HOUR,
    );
    const result = await reap(database);
    expect(result.retriedDeletions).toBeGreaterThanOrEqual(1);
    expect(await statusOf(due)).toBe('pending');
    expect(await statusOf(tooRecent)).toBe('dead');
    expect(await statusOf(exhausted)).toBe('dead');
    expect(result.dead).toBeGreaterThanOrEqual(2);
  });

  it('purges finished outbox rows after the retention period', async () => {
    const insert = (age: number) =>
      database
        .insert(mediaJobOutbox)
        .values({
          jobType: 'media.delete',
          payload: { objectKeys: [] },
          status: 'completed',
          completedAt: new Date(Date.now() - age),
        })
        .returning({ id: mediaJobOutbox.id })
        .then((rows) => rows[0]!.id);
    const old = await insert(OUTBOX_RETENTION_MS + DAY);
    const recent = await insert(DAY);
    await reap(database);
    expect(await statusOf(old)).toBeUndefined();
    expect(await statusOf(recent)).toBe('completed');
  });
});
