import type { JobHandler } from './job-router.js';
import { reap } from './maintenance/reaper.js';
import { createDeleteMediaHandler } from './media/delete-media.js';
import {
  createProcessMediaHandler,
  type MediaJobDependencies,
} from './media/process-media.js';

export const MAINTENANCE_REAPER_JOB = 'maintenance.reap';
export const MAINTENANCE_REAPER_SCHEDULER = 'maintenance-reaper';
export const MAINTENANCE_REAPER_EVERY_MS = 15 * 60 * 1_000;

/** Every job the worker understands, keyed by BullMQ job name. */
export function createJobHandlers(
  dependencies: MediaJobDependencies,
): Readonly<Record<string, JobHandler>> {
  return {
    [MAINTENANCE_REAPER_JOB]: async (_job, { logger }) => {
      const result = await reap(dependencies.database);
      const needsHuman =
        result.dead > 0 ||
        result.deadActivityEvents > 0 ||
        result.orphanedBackingPosts > 0;
      const log = needsHuman
        ? logger.error.bind(logger)
        : logger.info.bind(logger);
      log(result, 'maintenance reaper ran');
    },
    'media.process': createProcessMediaHandler(dependencies),
    'media.delete': createDeleteMediaHandler(dependencies),
  };
}
