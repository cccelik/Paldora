import { requireEnvironmentVariables } from '@paldora/config';
import {
  createDatabaseConnection,
  mediaAssets,
  mediaJobOutbox,
  mediaProcessJob,
  profiles,
  users,
  type MediaJobOutboxRow,
} from '@paldora/database';
import { createLogger } from '@paldora/observability';
import { MemoryObjectStorage } from '@paldora/storage';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createJobRouter } from './job-router.js';
import { createJobHandlers } from './jobs.js';
import { reap } from './maintenance/reaper.js';
import { derivativeKeys } from './media/process-media.js';
import { dispatchOnce } from './outbox/dispatcher.js';
import { recordJobFailure } from './outbox/failures.js';
import { claimDue } from './outbox/outbox-store.js';

const { DATABASE_URL, REDIS_URL } = requireEnvironmentVariables(
  ['DATABASE_URL', 'REDIS_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 6,
  applicationName: 'paldora-worker-test',
});
const database = connection.database;
const storage = new MemoryObjectStorage();
const logger = createLogger({
  service: 'worker',
  environment: 'test',
  level: 'silent',
});
const handlers = createJobHandlers({ database, storage });
const run = createJobRouter(handlers, { logger });

afterAll(() => connection.close());

/**
 * The database may hold other suites' (or a developer's) rows, so tests never
 * touch rows they did not create. Dispatcher tests backdate their own rows to
 * the epoch so the oldest-first claim order reaches them first.
 */
async function backdate(ids: readonly string[]): Promise<void> {
  await database
    .update(mediaJobOutbox)
    .set({ availableAt: new Date(0) })
    .where(inArray(mediaJobOutbox.id, [...ids]));
}

async function createUser(): Promise<string> {
  const email = `worker-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({
      authSubject: `subject-${randomUUID()}`,
      email,
      emailNormalized: email,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  await database.insert(profiles).values({ userId: user.id });
  return user.id;
}

async function jpegWithGps(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#a85' },
    })
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 31/1 0/1' },
      })
      .jpeg()
      .toBuffer(),
  );
}

async function uploadedAsset(
  ownerUserId: string,
  bytes: Uint8Array,
  createdAt = new Date(),
) {
  const uploadObjectKey = `uploads/${randomUUID()}`;
  storage.put(uploadObjectKey, 'image/jpeg', bytes);
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ownerUserId,
      purpose: 'avatar',
      status: 'processing',
      contentType: 'image/jpeg',
      contentLength: bytes.byteLength,
      uploadObjectKey,
      uploadExpiresAt: new Date(Date.now() + 300_000),
      createdAt,
    })
    .returning();
  if (!asset) throw new Error('asset insert failed');
  const [outbox] = await database
    .insert(mediaJobOutbox)
    .values(mediaProcessJob(asset.id))
    .returning();
  if (!outbox) throw new Error('outbox insert failed');
  return { asset, outbox };
}

const fakeJob = (row: Pick<MediaJobOutboxRow, 'id' | 'jobType'>) =>
  ({ id: row.id, name: row.jobType, data: { outboxId: row.id } }) as Job;

async function outboxRow(id: string) {
  const [row] = await database
    .select()
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.id, id));
  return row;
}

async function assetRow(id: string) {
  const [row] = await database
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));
  return row;
}

async function deletionJobsFor(key: string) {
  return database
    .select()
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${key}`,
      ),
    );
}

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
    const [rawDeletion] = await deletionJobsFor(asset.uploadObjectKey);
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
    expect(await deletionJobsFor(asset.uploadObjectKey)).toHaveLength(1);
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
      await deletionJobsFor(derivativeKeys(first.asset.id).masterObjectKey),
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
    expect(await deletionJobsFor(asset.uploadObjectKey)).toHaveLength(1);
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
    await backdate(created);
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
      await backdate([outbox.id]);
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
        uploadExpiresAt: new Date(Date.now() - 2 * 3_600_000),
      })
      .returning();
    const { outbox } = await uploadedAsset(userId, new Uint8Array(1));
    await database
      .update(mediaJobOutbox)
      .set({
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000),
      })
      .where(eq(mediaJobOutbox.id, outbox.id));

    const result = await reap(database);
    expect(result.expiredUploads).toBeGreaterThanOrEqual(1);
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect(await assetRow(abandoned!.id)).toMatchObject({
      status: 'failed',
      failureReason: 'expired',
    });
    expect(await deletionJobsFor(uploadObjectKey)).toHaveLength(1);
    expect(await outboxRow(outbox.id)).toMatchObject({
      status: 'pending',
      claimedAt: null,
    });
  });
});
