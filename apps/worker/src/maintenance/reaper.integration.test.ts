import {
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaJobOutbox,
  postMedia,
  postReactions,
  posts,
  rooms,
} from '@paldora/database';
import {
  DAY,
  HOUR,
  beforeAnyRun,
  deletionJobsFor,
  readyMediaAsset,
} from '@paldora/database/testing';
import { MEDIA_PURPOSES } from '@paldora/domain';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derivativeKeys } from '../media/process-media.js';
import { connectTestDatabase } from '../test-support/database.js';
import { assetRow, drainDeletions, objectsOf } from '../test-support/media.js';
import {
  pipelineTools,
  userScoped,
  type PipelinePurpose,
} from '../test-support/pipeline.js';
import {
  DEAD_RETRY_AFTER_MS,
  MAX_DELETE_ATTEMPTS,
  OUTBOX_RETENTION_MS,
  reap,
} from './reaper.js';
import { CLAIMED_PURPOSES } from './unattached-media.js';

/** Unclaimed photos, dead deletions, and outbox retention. */
const { database } = connectTestDatabase('paldora-reaper-test');
const { worker, person, boxOf } = pipelineTools(database);

describe('reaper', () => {
  /** Claims a Life Update photo the way the API's publish transaction does. */
  async function onlyMeLifeUpdate(ownerId: string, mediaAssetId: string) {
    await database.transaction(async (transaction) => {
      const [update] = await transaction
        .insert(lifeUpdates)
        .values({
          authorUserId: ownerId,
          audience: 'only_me',
          sections: { travel: 'x' },
        })
        .returning({ id: lifeUpdates.id });
      await transaction.insert(lifeUpdateDeliveries).values({
        lifeUpdateId: update!.id,
        audience: 'only_me',
        authorUserId: ownerId,
        position: 0,
      });
      await transaction
        .insert(lifeUpdateMedia)
        .values({ lifeUpdateId: update!.id, mediaAssetId, position: 0 });
    });
  }

  async function readyPhoto(
    ageMs: number,
    attached = false,
    purpose: PipelinePurpose = 'post_image',
    at = new Date(Date.now() - ageMs),
  ) {
    const ownerId = await person();
    const boxId = userScoped(purpose) ? null : await boxOf(ownerId);
    const { id, keys } = await readyMediaAsset(database, {
      ownerId,
      boxId,
      purpose,
      contentLength: 10,
      uploadExpiresAt: at,
      width: 10,
      height: 10,
      createdAt: at,
      updatedAt: at,
    });
    if (attached && purpose === 'life_update_image') {
      await onlyMeLifeUpdate(ownerId, id);
    } else if (attached && purpose === 'room_banner') {
      // The API claims a banner by saving it on the owner's Room.
      await database
        .insert(rooms)
        .values({ userId: ownerId, bannerMediaId: id });
    } else if (attached && boxId) {
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
    return { id, ...keys };
  }

  it('removes ready photos nobody claimed within a day, and only those', async () => {
    const stale = await readyPhoto(2 * DAY);
    const fresh = await readyPhoto(HOUR);
    const kept = await readyPhoto(2 * DAY, true);
    const result = await reap(database);
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect((await assetRow(database, stale.id))?.status).toBe('deleted');
    expect((await assetRow(database, fresh.id))?.status).toBe('ready');
    expect((await assetRow(database, kept.id))?.status).toBe('ready');
    const jobs = await deletionJobsFor(database, stale.masterObjectKey);
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
      beforeAnyRun(),
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
    expect((await assetRow(database, stale.id))?.status).toBe('deleted');
    expect((await assetRow(database, fresh.id))?.status).toBe('ready');
    expect((await assetRow(database, kept.id))?.status).toBe('ready');
    await drainDeletions(database, run);
    expect(objectsOf(storage, stale)).toEqual([]);
    for (const asset of [fresh, kept]) {
      expect(objectsOf(storage, asset).sort()).toEqual(
        Object.values(derivativeKeys(asset.id)).sort(),
      );
    }
  });

  it('removes Life Update photos no Life Update claimed, and only those', async () => {
    const stale = await readyPhoto(
      2 * DAY,
      false,
      'life_update_image',
      beforeAnyRun(),
    );
    const fresh = await readyPhoto(HOUR, false, 'life_update_image');
    const kept = await readyPhoto(2 * DAY, true, 'life_update_image');
    const result = await reap(database);
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect((await assetRow(database, stale.id))?.status).toBe('deleted');
    expect((await assetRow(database, fresh.id))?.status).toBe('ready');
    expect((await assetRow(database, kept.id))?.status).toBe('ready');
    const jobs = await deletionJobsFor(database, stale.masterObjectKey);
    expect(jobs).toHaveLength(1);
  });

  it('sweeps exactly the purposes of media_assets_unattached_index', async () => {
    const result = await database.execute<{ definition: string }>(sql`
      select indexdef as definition from pg_indexes
      where schemaname = 'paldora' and indexname = 'media_assets_unattached_index'`);
    const definition = result.rows[0]?.definition ?? '';
    const indexed = [...definition.matchAll(/'([a-z_]+)'::text/g)]
      .map((match) => match[1])
      .filter((value) => value !== 'ready');
    expect(indexed.sort()).toEqual([...CLAIMED_PURPOSES].sort());
    // Every purpose an API transaction claims; avatars attach in the worker.
    expect([...CLAIMED_PURPOSES].sort()).toEqual(
      MEDIA_PURPOSES.filter((purpose) => purpose !== 'avatar').sort(),
    );
  });

  it('removes Room banners no Room claimed, and never a claimed one', async () => {
    const stale = await readyPhoto(
      2 * DAY,
      false,
      'room_banner',
      beforeAnyRun(),
    );
    const fresh = await readyPhoto(HOUR, false, 'room_banner');
    const kept = await readyPhoto(2 * DAY, true, 'room_banner');
    const result = await reap(database);
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect((await assetRow(database, stale.id))?.status).toBe('deleted');
    expect((await assetRow(database, fresh.id))?.status).toBe('ready');
    expect((await assetRow(database, kept.id))?.status).toBe('ready');
    const jobs = await deletionJobsFor(database, stale.masterObjectKey);
    expect(jobs).toHaveLength(1);
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
