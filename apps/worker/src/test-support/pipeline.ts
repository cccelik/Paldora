import type { PaldoraDatabase } from '@paldora/database';
import { createBox, createPerson } from '@paldora/database/testing';
import { MemoryObjectStorage } from '@paldora/storage';
import { createJobRouter } from '../job-router.js';
import { createJobHandlers } from '../jobs.js';
import { silentLogger } from './database.js';
import { jpegWithGps, queuedUpload } from './media.js';

export type PipelinePurpose =
  'post_image' | 'reaction_image' | 'life_update_image' | 'room_banner';

/** User-scoped purposes never name a Box. */
export const userScoped = (purpose: PipelinePurpose) =>
  purpose === 'life_update_image' || purpose === 'room_banner';

/** A large photo with EXIF GPS, bigger than every derivative bound. */
export const bigJpeg = () =>
  jpegWithGps({
    width: 3000,
    height: 2000,
    background: '#b86',
    orientation: 1,
  });

/** Media pipeline tooling: isolated workers and queued uploads. */
export function pipelineTools(database: PaldoraDatabase) {
  const logger = silentLogger();

  /** Storage plus a handler router, as one isolated worker would run. */
  function worker(storage = new MemoryObjectStorage()) {
    const run = createJobRouter(createJobHandlers({ database, storage }), {
      logger,
    });
    return { storage, run };
  }

  const person = () => createPerson(database, { label: 'pipe' });
  const boxOf = (ownerId: string) =>
    createBox(database, ownerId, [], { name: 'Pipeline' });

  /** A reserved, completed upload waiting for the worker. */
  async function queuedPhoto(
    storage: MemoryObjectStorage,
    bytes?: Uint8Array,
    purpose: PipelinePurpose = 'post_image',
  ) {
    const ownerId = await person();
    // Life Update photos and Room banners are user-scoped: no Box.
    const boxId = userScoped(purpose) ? null : await boxOf(ownerId);
    const { asset, outbox } = await queuedUpload(database, storage, {
      ownerUserId: ownerId,
      boxId,
      purpose,
      bytes: bytes ?? (await bigJpeg()),
    });
    return { asset, outbox, ownerId, boxId };
  }

  return { logger, worker, person, boxOf, queuedPhoto };
}
