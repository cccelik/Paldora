import { MEDIA_DELETE_JOB, MEDIA_PROCESS_JOB } from '@paldora/domain';
import type { JobHandler } from './job-router.js';
import { reap } from './maintenance/reaper.js';
import { createDeleteMediaHandler } from './media/delete-media.js';
import {
  buildNextExport,
  expireNextExport,
} from './account-export/export-archive.js';
import {
  finishNextErasure,
  startNextDueErasure,
  type AuthAccountDeleter,
} from './account-deletion/erase-account.js';
import {
  createProcessMediaHandler,
  type MediaJobDependencies,
} from './media/process-media.js';

export const MAINTENANCE_REAPER_JOB = 'maintenance.reap';
export const MAINTENANCE_REAPER_SCHEDULER = 'maintenance-reaper';
export const MAINTENANCE_REAPER_EVERY_MS = 15 * 60 * 1_000;

/** Every job the worker understands, keyed by BullMQ job name. */
export function createJobHandlers(
  dependencies: MediaJobDependencies & {
    readonly authDeleter?: AuthAccountDeleter;
  },
): Readonly<Record<string, JobHandler>> {
  return {
    [MAINTENANCE_REAPER_JOB]: async (_job, { logger }) => {
      const result = await reap(dependencies.database);
      const exportBuilt = await buildNextExport(
        dependencies.database,
        dependencies.storage,
      );
      const exportExpired = await expireNextExport(
        dependencies.database,
        dependencies.storage,
      );
      const erasureStarted = dependencies.authDeleter
        ? await startNextDueErasure(dependencies.database)
        : false;
      const erasureCompleted = dependencies.authDeleter
        ? await finishNextErasure(
            dependencies.database,
            dependencies.storage,
            dependencies.authDeleter,
          )
        : false;
      const needsHuman =
        result.dead > 0 ||
        result.deadActivityEvents > 0 ||
        result.orphanedBackingPosts > 0;
      const log = needsHuman
        ? logger.error.bind(logger)
        : logger.info.bind(logger);
      log(
        {
          ...result,
          exportBuilt,
          exportExpired,
          erasureStarted,
          erasureCompleted,
        },
        'maintenance reaper ran',
      );
    },
    [MEDIA_PROCESS_JOB]: createProcessMediaHandler(dependencies),
    [MEDIA_DELETE_JOB]: createDeleteMediaHandler(dependencies),
  };
}
