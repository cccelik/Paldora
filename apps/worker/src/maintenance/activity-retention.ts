import {
  activityEvents,
  notifications,
  type PaldoraDatabase,
} from '@paldora/database';
import { and, asc, count, eq, inArray, lt } from 'drizzle-orm';

const day = 24 * 60 * 60 * 1_000;
/** Completed events are only history once projected (plan decision 8). */
export const ACTIVITY_EVENT_RETENTION_MS = 14 * day;
/** Notifications, read or not, are kept for 90 days. */
export const NOTIFICATION_RETENTION_MS = 90 * day;
const purgeBatchSize = 1_000;

export interface ActivityRetentionResult {
  readonly purgedActivityEvents: number;
  readonly purgedNotifications: number;
  /** Events that exhausted their attempts: these need a human. */
  readonly deadActivityEvents: number;
}

async function purgeCompletedEvents(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const expired = database
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.status, 'completed'),
        lt(
          activityEvents.completedAt,
          new Date(now.getTime() - ACTIVITY_EVENT_RETENTION_MS),
        ),
      ),
    )
    .orderBy(asc(activityEvents.completedAt))
    .limit(purgeBatchSize);
  // `notifications.activity_event_id` is SET NULL: notifications survive.
  const purged = await database
    .delete(activityEvents)
    .where(inArray(activityEvents.id, expired))
    .returning({ id: activityEvents.id });
  return purged.length;
}

async function purgeOldNotifications(
  database: PaldoraDatabase,
  now: Date,
): Promise<number> {
  const expired = database
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      lt(
        notifications.createdAt,
        new Date(now.getTime() - NOTIFICATION_RETENTION_MS),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .limit(purgeBatchSize);
  const purged = await database
    .delete(notifications)
    .where(inArray(notifications.id, expired))
    .returning({ id: notifications.id });
  return purged.length;
}

/**
 * Bounded retention for the interactions outbox and notifications, run by
 * the scheduled reaper. Each call removes at most one batch of each, oldest
 * first, so a backlog drains over several runs without long locks.
 */
export async function retainActivity(
  database: PaldoraDatabase,
  now = new Date(),
): Promise<ActivityRetentionResult> {
  const purgedActivityEvents = await purgeCompletedEvents(database, now);
  const purgedNotifications = await purgeOldNotifications(database, now);
  const [deadRows] = await database
    .select({ value: count() })
    .from(activityEvents)
    .where(eq(activityEvents.status, 'dead'));
  return {
    purgedActivityEvents,
    purgedNotifications,
    deadActivityEvents: deadRows?.value ?? 0,
  };
}
