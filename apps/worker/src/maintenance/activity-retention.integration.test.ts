import { activityEvents, notifications } from '@paldora/database';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { activityTools } from '../test-support/activity.js';
import { connectTestDatabase } from '../test-support/database.js';
import { retainActivity } from './activity-retention.js';

const { database } = connectTestDatabase('paldora-retention-test', {
  required: ['DATABASE_URL', 'REDIS_URL'],
});
const { scene } = activityTools(database);

describe('activity retention', () => {
  const day = 24 * 60 * 60 * 1_000;

  it('purges only old completed events and old notifications, and counts dead events', async () => {
    const { author, guest, postId } = await scene();
    const now = Date.now();
    const insertEvent = async (
      actor: string,
      status: 'completed' | 'dead',
      completedAgo?: number,
    ) => {
      const [row] = await database
        .insert(activityEvents)
        .values({
          type: 'post.reaction.set',
          actorUserId: actor,
          postId,
          dedupeKey: `retention:${randomUUID()}`,
          status,
          completedAt:
            completedAgo === undefined ? null : new Date(now - completedAgo),
        })
        .returning({ id: activityEvents.id });
      return row?.id ?? '';
    };
    const oldEvent = await insertEvent(guest, 'completed', 15 * day);
    const recentEvent = await insertEvent(guest, 'completed', 13 * day);
    const deadEvent = await insertEvent(guest, 'dead');
    const insertNotification = async (ageMs: number) => {
      const [row] = await database
        .insert(notifications)
        .values({
          recipientUserId: author,
          actorUserId: guest,
          type: 'post.reaction',
          postId,
          activityEventId: oldEvent,
          dedupeKey: `retention:${randomUUID()}`,
          createdAt: new Date(now - ageMs),
        })
        .returning({ id: notifications.id });
      return row?.id ?? '';
    };
    const oldNotification = await insertNotification(91 * day);
    const recentNotification = await insertNotification(89 * day);

    let result = await retainActivity(database);
    expect(result.deadActivityEvents).toBeGreaterThanOrEqual(1);
    for (let round = 0; round < 20; round += 1) {
      if (result.purgedActivityEvents === 0 && result.purgedNotifications === 0)
        break;
      // Sequential by protocol: each bounded batch commits before the next.

      result = await retainActivity(database);
    }

    const events = await database
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(inArray(activityEvents.id, [oldEvent, recentEvent, deadEvent]));
    expect(events.map((row) => row.id).sort()).toEqual(
      [recentEvent, deadEvent].sort(),
    );
    const kept = await database
      .select({ id: notifications.id, eventId: notifications.activityEventId })
      .from(notifications)
      .where(inArray(notifications.id, [oldNotification, recentNotification]));
    // Purging an event never deletes its notification (SET NULL).
    expect(kept).toEqual([{ id: recentNotification, eventId: null }]);
  });
});
