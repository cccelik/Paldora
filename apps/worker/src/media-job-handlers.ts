import {
  mediaAssets,
  postMedia,
  postReactions,
  posts,
  type PaldoraDatabase,
} from '@paldora/database';
import { POST_EVENT_CHANNEL, type MediaAssetId } from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import type { Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { processPostImage } from './image-processor.js';
import { parseMediaJobPayload, type MediaJobPayload } from './job-payload.js';

interface EventPublisher {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface MediaJobDependencies {
  database: PaldoraDatabase;
  storage: ObjectStorage;
  eventPublisher: EventPublisher;
}

export async function handleMediaJob(
  job: Job,
  dependencies: MediaJobDependencies,
): Promise<void> {
  const payload = parseMediaJobPayload(job.data);
  switch (job.name) {
    case 'delete-media-object':
      await deleteMediaObject(payload, dependencies);
      return;
    case 'process-post-image':
      await processMediaObject(payload.mediaAssetId, dependencies);
      return;
    default:
      throw new Error(`Unsupported job type: ${job.name}`);
  }
}

export async function markFinalProcessingFailure(
  mediaAssetId: MediaAssetId,
  dependencies: MediaJobDependencies,
): Promise<void> {
  await dependencies.database
    .update(mediaAssets)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(mediaAssets.id, mediaAssetId));
  await publishMediaUpdate(mediaAssetId, dependencies);
}

async function deleteMediaObject(
  payload: MediaJobPayload,
  { database, storage }: MediaJobDependencies,
): Promise<void> {
  const { mediaAssetId } = payload;
  const [asset] = await database
    .select({
      objectKey: mediaAssets.objectKey,
      displayObjectKey: mediaAssets.displayObjectKey,
      thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  const objectKeys =
    payload.objectKeys ??
    (asset
      ? [
          asset.objectKey,
          asset.displayObjectKey,
          asset.thumbnailObjectKey,
        ].filter((key): key is string => Boolean(key))
      : []);
  await Promise.all(objectKeys.map((key) => storage.deleteObject(key)));
  if (asset) {
    await database.delete(mediaAssets).where(eq(mediaAssets.id, mediaAssetId));
  }
}

async function processMediaObject(
  mediaAssetId: MediaAssetId,
  dependencies: MediaJobDependencies,
): Promise<void> {
  const { database, storage } = dependencies;
  const [asset] = await database
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, mediaAssetId),
        inArray(mediaAssets.purpose, ['post_image', 'reaction_image']),
        eq(mediaAssets.status, 'processing'),
      ),
    )
    .limit(1);
  if (!asset) return;
  const processed = await processPostImage(
    await storage.readObject(asset.objectKey),
  );
  const displayObjectKey = `${asset.objectKey}.display.webp`;
  const thumbnailObjectKey = `${asset.objectKey}.thumbnail.webp`;
  await Promise.all([
    storage.writeObject(displayObjectKey, 'image/webp', processed.display),
    storage.writeObject(thumbnailObjectKey, 'image/webp', processed.thumbnail),
  ]);
  const [ready] = await database
    .update(mediaAssets)
    .set({
      status: 'ready',
      displayObjectKey,
      thumbnailObjectKey,
      width: processed.width,
      height: processed.height,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaAssets.id, mediaAssetId),
        eq(mediaAssets.status, 'processing'),
      ),
    )
    .returning({ id: mediaAssets.id });
  if (!ready) {
    await Promise.all([
      storage.deleteObject(displayObjectKey),
      storage.deleteObject(thumbnailObjectKey),
    ]);
    return;
  }
  await publishMediaUpdate(mediaAssetId, dependencies);
}

async function publishMediaUpdate(
  mediaAssetId: MediaAssetId,
  { database, eventPublisher }: MediaJobDependencies,
): Promise<void> {
  const [postAttachment] = await database
    .select({ postId: posts.id, boxId: posts.boxId })
    .from(postMedia)
    .innerJoin(posts, eq(posts.id, postMedia.postId))
    .where(eq(postMedia.mediaAssetId, mediaAssetId))
    .limit(1);
  const [reactionAttachment] = postAttachment
    ? []
    : await database
        .select({ postId: posts.id, boxId: posts.boxId })
        .from(postReactions)
        .innerJoin(posts, eq(posts.id, postReactions.postId))
        .where(eq(postReactions.mediaAssetId, mediaAssetId))
        .limit(1);
  const attached = postAttachment ?? reactionAttachment;
  if (!attached) return;
  await eventPublisher.publish(
    POST_EVENT_CHANNEL,
    JSON.stringify({
      id: randomUUID(),
      action: 'updated',
      boxId: attached.boxId,
      postId: attached.postId,
      occurredAt: new Date().toISOString(),
    }),
  );
}
