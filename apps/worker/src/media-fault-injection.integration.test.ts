import { mediaAssets, mediaJobOutbox } from '@paldora/database';
import { beforeAnyRun } from '@paldora/database/testing';
import { MemoryObjectStorage } from '@paldora/storage';
import type { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { derivativeKeys } from './media/process-media.js';
import { dispatchOnce } from './outbox/dispatcher.js';
import { recordJobFailure } from './outbox/failures.js';
import { CLAIM_LEASE_MS } from './outbox/outbox-store.js';
import { connectTestDatabase } from './test-support/database.js';
import {
  assetRow,
  drainDeletions,
  fakeJob,
  objectsOf,
} from './test-support/media.js';
import { pipelineTools } from './test-support/pipeline.js';

const { database } = connectTestDatabase('paldora-pipeline-fault-test');
const { logger, worker, queuedPhoto } = pipelineTools(database);

describe('fault injection: no orphaned objects', () => {
  it('survives a storage failure halfway through writing derivatives', async () => {
    const { storage, run } = worker();
    const { asset, outbox } = await queuedPhoto(storage);
    storage.failNext(); // the first write fails; the others may land
    await expect(run(fakeJob(outbox))).rejects.toThrow(/storage unavailable/);
    expect((await assetRow(database, asset.id))?.status).toBe('processing');

    await run(fakeJob(outbox)); // BullMQ's retry
    expect((await assetRow(database, asset.id))?.status).toBe('ready');
    await drainDeletions(database, run);
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

    expect(await assetRow(database, asset.id)).toMatchObject({
      status: 'failed',
      failureReason: 'processing_exhausted',
    });
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });

  it('keeps deletion intent when Redis is down and delivers it later', async () => {
    const { storage } = worker();
    const { outbox } = await queuedPhoto(storage);
    await database
      .update(mediaJobOutbox)
      // Earlier than any leftover row, including one an interrupted earlier
      // run of this test left behind: each run picks an earlier instant.
      .set({ availableAt: beforeAnyRun() })
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
    expect((await assetRow(database, asset.id))?.status).toBe('deleted');
    await drainDeletions(database, run);
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
    expect((await assetRow(database, asset.id))?.status).toBe('deleted');
    await drainDeletions(database, run);
    expect(objectsOf(storage, asset)).toEqual([]);
  });
});
