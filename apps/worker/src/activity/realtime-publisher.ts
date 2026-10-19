import type { Logger } from '@paldora/observability';
import { userChannel, type RealtimeEvent } from '@paldora/validation';
import type { Redis } from 'ioredis';
import type { CreatedNotification } from './projection-rules.js';

export interface NotificationPublisher {
  /** Best effort and never throws: a lost hint is repaired by `resync`. */
  notificationsCreated(created: readonly CreatedNotification[]): Promise<void>;
}

/**
 * Publishes `notification.created` hints on each recipient's user channel,
 * the channel the API's `/me/events` streams subscribe to. Called only after
 * the projection commits. The hint is IDs only: the client refetches its
 * notifications through the normal, visibility-checked route.
 */
export function createRealtimePublisher(
  redis: Pick<Redis, 'publish'>,
  logger: Logger,
): NotificationPublisher {
  return {
    async notificationsCreated(created) {
      await Promise.all(
        created.map(async (notification) => {
          const channel = userChannel(notification.recipientUserId);
          const event: RealtimeEvent = {
            type: 'notification.created',
            notificationId: notification.id,
            postId: notification.postId,
            at: new Date().toISOString(),
          };
          try {
            await redis.publish(channel, JSON.stringify(event));
          } catch (error) {
            logger.warn(
              { err: error, notificationId: notification.id },
              'notification hint not published',
            );
          }
        }),
      );
    },
  };
}
