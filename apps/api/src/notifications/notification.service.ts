import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { notifications, type PaldoraDatabase } from '@paldora/database';
import { and, eq, isNull } from 'drizzle-orm';
import { defineError } from '../platform/http/api-error.js';
import { DATABASE } from '../platform/config/tokens.js';
import { RealtimeBus } from '../realtime/realtime-bus.js';
import { NotificationQueryService } from './notification-query.service.js';
import { visibleTo } from './notification-visibility.js';

/** Someone else's, hidden, and missing notifications all look the same. */
export const notificationNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'NOTIFICATION_NOT_FOUND',
  'That notification isn’t available.',
);

/**
 * Marking notifications read. Both operations are idempotent set-state
 * writes in one statement each, and tell the person's other tabs after the
 * write (`notifications.changed`, best effort, IDs only).
 */
@Injectable()
export class NotificationService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(NotificationQueryService)
    private readonly queries: NotificationQueryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  /**
   * Visibility is confirmed first, so another person's ID, or one whose
   * target is gone or behind a block, answers NOTIFICATION_NOT_FOUND rather
   * than silently succeeding. Already read is a no-op.
   */
  public async markRead(viewerId: string, notificationId: string) {
    const found = await this.queries.findVisible(
      this.database,
      viewerId,
      notificationId,
    );
    if (!found) throw notificationNotFound();
    if (found.readAt) return;
    const changed = await this.database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientUserId, viewerId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    if (changed.length > 0)
      await this.bus.userEvent(viewerId, 'notifications.changed');
  }

  /** Marks every notification the viewer can currently see as read. */
  public async markAllRead(viewerId: string) {
    const changed = await this.database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(visibleTo(viewerId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (changed.length > 0)
      await this.bus.userEvent(viewerId, 'notifications.changed');
  }
}
