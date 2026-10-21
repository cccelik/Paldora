import { mediaAssets, mediaJobOutbox, profiles } from '@paldora/database';
import {
  backdate,
  beforeAnyRun,
  createPerson,
  deletionJobsFor,
} from '@paldora/database/testing';
import { MemoryObjectStorage } from '@paldora/storage';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createJobRouter } from './job-router.js';
import { createJobHandlers } from './jobs.js';
import { reap } from './maintenance/reaper.js';
import { derivativeKeys } from './media/process-media.js';
import { dispatchOnce } from './outbox/dispatcher.js';
import { recordJobFailure } from './outbox/failures.js';
import { claimDue } from './outbox/outbox-store.js';
import { connectTestDatabase, silentLogger } from './test-support/database.js';
import {
  assetRow as assetRowIn,
  fakeJob,
  jpegWithGps as gpsJpeg,
  outboxRow as outboxRowIn,
  queuedUpload,
} from './test-support/media.js';

/**
 * The database may hold other suites' (or a developer's) rows, so tests never
 * touch rows they did not create. Dispatcher tests `backdate` their own rows
 * so the oldest-first claim order reaches them first.
 */
const { database, env } = connectTestDatabase('paldora-worker-test', {
  required: ['DATABASE_URL', 'REDIS_URL'],
});
const { REDIS_URL } = env;
const storage = new MemoryObjectStorage();
const logger = silentLogger();
const handlers = createJobHandlers({ database, storage });
const run = createJobRouter(handlers, { logger });

const createUser = () => createPerson(database, { label: 'worker' });
const jpegWithGps = () =>
  gpsJpeg({ width: 900, height: 600, background: '#a85', orientation: 6 });

/** An avatar upload waiting for the worker, its bytes in this suite's storage. */
const uploadedAsset = (
  ownerUserId: string,
  bytes: Uint8Array,
  createdAt = new Date(),
) =>
  queuedUpload(database, storage, {
    ownerUserId,
    purpose: 'avatar',
    bytes,
    createdAt,
  });

const outboxRow = (id: string) => outboxRowIn(database, id);
const assetRow = (id: string) => assetRowIn(database, id);

describe('media.process', () => {
  it('stores metadata-free derivatives, attaches the avatar, and discards the raw upload', async () => {
    const userId = await createUser();
    const { asset, outbox } = await uploadedAsset(userId, await jpegWithGps());
    await run(fakeJob(outbox));

    const ready = await assetRow(asset.id);
    expect(ready).toMatchObject({
      status: 'ready',
      ...derivativeKeys(asset.id),
    });
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'completed',
      attempts: 1,
    });
    const [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profile?.avatarMediaId).toBe(asset.id);

    for (const key of Object.values(derivativeKeys(asset.id))) {
      const stored = storage.objects.get(key);
      expect(stored?.contentType).toBe('image/webp');
      expect((await sharp(stored?.body).metadata()).exif).toBeUndefined();
    }
    // D2: the raw upload is queued for deletion, then actually removed.
    const [rawDeletion] = await deletionJobsFor(
      database,
      asset.uploadObjectKey,
    );
    expect(rawDeletion).toBeDefined();
    await run(fakeJob(rawDeletion!));
    expect(storage.objects.has(asset.uploadObjectKey)).toBe(false);
  });

  it('is idempotent when the same job is delivered twice', async () => {
    const userId = await createUser();
    const { outbox } = await uploadedAsset(userId, await jpegWithGps());
    await run(fakeJob(outbox));
    await run(fakeJob(outbox));
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'completed',
      attempts: 1,
    });
  });

  it('fails undecodable uploads without retrying and deletes them', async () => {
    const userId = await createUser();
    const { asset, outbox } = await uploadedAsset(
      userId,
      new Uint8Array(400).fill(3),
    );
    await run(fakeJob(outbox));
    expect(await assetRow(asset.id)).toMatchObject({
      status: 'failed',
      failureReason: 'undecodable',
    });
    expect(await outboxRow(outbox.id)).toMatchObject({ status: 'completed' });
    expect(await deletionJobsFor(database, asset.uploadObjectKey)).toHaveLength(
      1,
    );
    const [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profile?.avatarMediaId).toBeNull();
  });

  it('keeps the old avatar until the new one is ready, then retires it', async () => {
    const userId = await createUser();
    const first = await uploadedAsset(
      userId,
      await jpegWithGps(),
      new Date(Date.now() - 60_000),
    );
    await run(fakeJob(first.outbox));
    const second = await uploadedAsset(userId, await jpegWithGps());

    storage.failNext();
    await expect(run(fakeJob(second.outbox))).rejects.toThrow(
      /storage unavailable/,
    );
    let [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profile?.avatarMediaId).toBe(first.asset.id);

    await run(fakeJob(second.outbox));
    [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profile?.avatarMediaId).toBe(second.asset.id);
    expect((await assetRow(first.asset.id))?.status).toBe('deleted');
    expect(
      await deletionJobsFor(
        database,
        derivativeKeys(first.asset.id).masterObjectKey,
      ),
    ).toHaveLength(1);
  });

  it('retires an older upload that finishes after a newer avatar', async () => {
    const userId = await createUser();
    const older = await uploadedAsset(
      userId,
      await jpegWithGps(),
      new Date(Date.now() - 60_000),
    );
    const newer = await uploadedAsset(userId, await jpegWithGps());
    await run(fakeJob(newer.outbox));
    await run(fakeJob(older.outbox));
    const [profile] = await database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profile?.avatarMediaId).toBe(newer.asset.id);
    expect((await assetRow(older.asset.id))?.status).toBe('deleted');
  });
});

describe('failure mirroring', () => {
  it('dead-letters an exhausted job and fails its asset', async () => {
    const userId = await createUser();
    const { asset, outbox } = await uploadedAsset(userId, await jpegWithGps());
    const job = {
      ...fakeJob(outbox),
      attemptsMade: 5,
      opts: { attempts: 5 },
    } as Job;
    await recordJobFailure(database, logger, job, new Error('storage 503'));
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'dead',
      lastError: 'storage 503',
    });
    expect(await assetRow(asset.id)).toMatchObject({
      status: 'failed',
      failureReason: 'processing_exhausted',
    });
    expect(await deletionJobsFor(database, asset.uploadObjectKey)).toHaveLength(
      1,
    );
  });

  it('only counts an attempt while retries remain', async () => {
    const userId = await createUser();
    const { outbox } = await uploadedAsset(userId, await jpegWithGps());
    const job = {
      ...fakeJob(outbox),
      attemptsMade: 1,
      opts: { attempts: 5 },
    } as Job;
    await recordJobFailure(database, logger, job, new Error('transient'));
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
  });
});

describe('dispatcher', () => {
  it('never hands the same row to two concurrent dispatchers', async () => {
    const userId = await createUser();
    const created = await Promise.all(
      Array.from(
        { length: 6 },
        async () => (await uploadedAsset(userId, new Uint8Array(1))).outbox.id,
      ),
    );
    await backdate(database, created);
    const [left, right] = await Promise.all([
      claimDue(database, 3),
      claimDue(database, 3),
    ]);
    const claimed = [...(left ?? []), ...(right ?? [])].map((row) => row.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...created].sort());
  });

  it('delivers through BullMQ with the outbox ID as the job ID', async () => {
    const queueName = `paldora-test-${randomUUID()}`;
    const redis = new Redis(REDIS_URL ?? '', { maxRetriesPerRequest: null });
    const queue = new Queue(queueName, { connection: redis });
    const events = new QueueEvents(queueName, {
      connection: redis.duplicate(),
    });
    const worker = new Worker(queueName, run, {
      connection: redis.duplicate(),
    });
    try {
      await events.waitUntilReady();
      const userId = await createUser();
      const { asset, outbox } = await uploadedAsset(
        userId,
        await jpegWithGps(),
      );
      await backdate(database, [outbox.id]);
      expect(await dispatchOnce(database, queue, 1)).toBe(1);
      expect((await outboxRow(outbox.id))?.status).toBe('published');
      const job = await queue.getJob(outbox.id);
      await job?.waitUntilFinished(events, 15_000);
      expect((await outboxRow(outbox.id))?.status).toBe('completed');
      expect((await assetRow(asset.id))?.status).toBe('ready');
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await redis.quit();
    }
  });
});

describe('reaper', () => {
  it('expires abandoned reservations and requeues stalled rows', async () => {
    const now = beforeAnyRun();
    const userId = await createUser();
    const uploadObjectKey = `uploads/${randomUUID()}`;
    const [abandoned] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId: userId,
        purpose: 'avatar',
        contentType: 'image/png',
        contentLength: 10,
        uploadObjectKey,
        uploadExpiresAt: new Date(now.getTime() - 2 * 3_600_000),
      })
      .returning();
    const { outbox } = await uploadedAsset(userId, new Uint8Array(1));
    await database
      .update(mediaJobOutbox)
      .set({
        status: 'published',
        publishedAt: new Date(now.getTime() - 3_600_000),
      })
      .where(eq(mediaJobOutbox.id, outbox.id));

    const result = await reap(database, now);
    expect(result.expiredUploads).toBeGreaterThanOrEqual(1);
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect(await assetRow(abandoned!.id)).toMatchObject({
      status: 'failed',
      failureReason: 'expired',
    });
    expect(await deletionJobsFor(database, uploadObjectKey)).toHaveLength(1);
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'pending',
      claimedAt: null,
    });
  });
});
