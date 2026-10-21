import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DatabaseExecutor } from '../index.js';
import { mediaAssets, mediaJobOutbox } from '../schema.js';

type MediaAssetInsert = typeof mediaAssets.$inferInsert;

/** The object keys of an asset, in the shape the API and worker use. */
export interface MediaAssetKeys {
  readonly uploadObjectKey: string;
  readonly masterObjectKey: string;
  readonly displayObjectKey: string;
  readonly thumbnailObjectKey: string;
}

export const mediaAssetKeys = (id: string): MediaAssetKeys => ({
  uploadObjectKey: `uploads/${id}`,
  masterObjectKey: `media/${id}/master.webp`,
  displayObjectKey: `media/${id}/display.webp`,
  thumbnailObjectKey: `media/${id}/thumbnail.webp`,
});

export interface ReadyMediaAssetOptions extends Partial<MediaAssetInsert> {
  readonly ownerId: string;
  readonly purpose: MediaAssetInsert['purpose'];
}

/**
 * A media asset as the worker leaves it after processing: derivative keys
 * and dimensions (1600×1200 unless given). With a `pending` or `processing`
 * status only the upload key is set, as before processing. Any other column
 * can be overridden.
 */
export async function readyMediaAsset(
  db: DatabaseExecutor,
  options: ReadyMediaAssetOptions,
): Promise<{ id: string; keys: MediaAssetKeys }> {
  const { ownerId, ...overrides } = options;
  const id = overrides.id ?? randomUUID();
  const keys = mediaAssetKeys(id);
  const status = overrides.status ?? 'ready';
  const processed = status !== 'pending' && status !== 'processing';
  await db.insert(mediaAssets).values({
    id,
    ownerUserId: ownerId,
    status,
    contentType: 'image/jpeg',
    contentLength: 1_000,
    uploadExpiresAt: new Date(),
    ...(processed
      ? { ...keys, width: 1600, height: 1200 }
      : { uploadObjectKey: keys.uploadObjectKey }),
    ...overrides,
  });
  return { id, keys };
}

export async function assetStatus(
  db: DatabaseExecutor,
  id: string,
): Promise<MediaAssetInsert['status'] | undefined> {
  const [row] = await db
    .select({ status: mediaAssets.status })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));
  return row?.status;
}

/** Queued `media.delete` rows whose payload names `key`. */
export function deletionJobsFor(db: DatabaseExecutor, key: string) {
  return db
    .select()
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        sql`${mediaJobOutbox.payload} -> 'objectKeys' ? ${key}`,
      ),
    );
}

/** How many `media.delete` rows name every one of `keys`. */
export async function deletionsFor(
  db: DatabaseExecutor,
  keys: readonly string[],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        sql`${mediaJobOutbox.payload} -> 'objectKeys' @> ${JSON.stringify(keys)}::jsonb`,
      ),
    );
  return row?.count ?? 0;
}

/** How many `media.delete` rows retire the asset's thumbnail. */
export async function deletionQueuedFor(
  db: DatabaseExecutor,
  mediaAssetId: string,
): Promise<number> {
  return (
    await deletionJobsFor(db, mediaAssetKeys(mediaAssetId).thumbnailObjectKey)
  ).length;
}

/**
 * The database may hold other suites' (or a developer's) rows. Moving these
 * outbox rows to an instant earlier than any earlier run used lets the
 * oldest-first claim reach them first.
 */
export async function backdate(
  db: DatabaseExecutor,
  outboxIds: readonly string[],
): Promise<void> {
  await db
    .update(mediaJobOutbox)
    .set({ availableAt: beforeAnyRun() })
    .where(inArray(mediaJobOutbox.id, [...outboxIds]));
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/**
 * An instant earlier than any earlier test run picked (each run goes further
 * back), so oldest-first claims reach this run's rows before leftovers.
 */
export const beforeAnyRun = (): Date => new Date(-Date.now());
