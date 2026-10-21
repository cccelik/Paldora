import {
  mediaAssets,
  mediaJobOutbox,
  mediaProcessJob,
  type MediaJobOutboxRow,
  type PaldoraDatabase,
} from '@paldora/database';
import type { MemoryObjectStorage } from '@paldora/storage';
import type { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

/** A BullMQ job as the queue hands it over for an outbox row. */
export const fakeJob = (row: Pick<MediaJobOutboxRow, 'id' | 'jobType'>) =>
  ({ id: row.id, name: row.jobType, data: { outboxId: row.id } }) as Job;

type Purpose = (typeof mediaAssets.$inferInsert)['purpose'];

/**
 * A reserved, completed upload waiting for the worker: the raw bytes are in
 * `storage` and a `media.process` row is queued.
 */
export async function queuedUpload(
  database: PaldoraDatabase,
  storage: MemoryObjectStorage,
  upload: {
    ownerUserId: string;
    purpose: Purpose;
    bytes: Uint8Array;
    boxId?: string | null;
    createdAt?: Date;
  },
) {
  const { bytes, ...values } = upload;
  const uploadObjectKey = `uploads/${randomUUID()}`;
  storage.put(uploadObjectKey, 'image/jpeg', bytes);
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ...values,
      status: 'processing',
      contentType: 'image/jpeg',
      contentLength: bytes.byteLength,
      uploadObjectKey,
      uploadExpiresAt: new Date(Date.now() + 300_000),
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

/** A JPEG carrying EXIF GPS coordinates, which the worker must strip. */
export async function jpegWithGps(options: {
  width: number;
  height: number;
  background: string;
  orientation: number;
}): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width: options.width,
        height: options.height,
        channels: 3,
        background: options.background,
      },
    })
      .withMetadata({ orientation: options.orientation })
      .withExifMerge({
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 31/1 0/1' },
      })
      .jpeg()
      .toBuffer(),
  );
}

export async function assetRow(database: PaldoraDatabase, id: string) {
  const [row] = await database
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));
  return row;
}

export async function outboxRow(database: PaldoraDatabase, id: string) {
  const [row] = await database
    .select()
    .from(mediaJobOutbox)
    .where(eq(mediaJobOutbox.id, id));
  return row;
}

/** Storage objects that belong to an asset (its upload and its derivatives). */
export function objectsOf(
  storage: MemoryObjectStorage,
  asset: { id: string; uploadObjectKey: string },
) {
  return [...storage.objects.keys()].filter(
    (key) =>
      key === asset.uploadObjectKey || key.startsWith(`media/${asset.id}/`),
  );
}

/** Runs every queued deletion job, the way the worker would. */
export async function drainDeletions(
  database: PaldoraDatabase,
  run: (job: Job) => Promise<unknown>,
) {
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
    // eslint-disable-next-line no-await-in-loop
    await run(fakeJob(row));
  }
}
