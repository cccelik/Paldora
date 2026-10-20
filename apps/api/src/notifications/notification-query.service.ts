import { Inject, Injectable } from '@nestjs/common';
import {
  boxes,
  commentReactions,
  lifeUpdateDeliveries,
  mediaAssets,
  notifications,
  postReactions,
  posts,
  type DatabaseExecutor,
} from '@paldora/database';
import {
  UNREAD_COUNT_CAP,
  type NotificationPage,
  type UnreadCount,
} from '@paldora/validation';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import { MediaUrlService } from '../media/media-urls.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  pageOf,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { toNotificationView } from './notification-views.js';
import { visibleTo } from './notification-visibility.js';

export interface NotificationPageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/**
 * Reading notifications. Every query applies `visibleTo`, so a row whose
 * post, Box membership, actor, or target is gone (or now behind a block) is
 * simply absent, never a placeholder. Display data (the actor's face, the
 * Box name, the emoji, the camera thumbnail) is joined from live rows here;
 * the notification itself stores IDs only.
 */
@Injectable()
export class NotificationQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(ProfileSummaryService)
    private readonly people: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  private get database() {
    return this.infrastructure.database;
  }

  /** Newest first, keyset on (created_at, id), with the unread count. */
  public async list(
    viewerId: string,
    query: NotificationPageQuery,
  ): Promise<NotificationPage> {
    const cursor = decodeCursor(query.cursor);
    const [rows, unreadCount] = await Promise.all([
      this.database
        .select({
          notification: notifications,
          at: cursorTimestamp(notifications.createdAt),
          box: { id: boxes.id, name: boxes.name },
          lifeUpdateId: lifeUpdateDeliveries.lifeUpdateId,
          postReactionKind: postReactions.kind,
          commentReactionKind: commentReactions.kind,
          image: {
            id: mediaAssets.id,
            status: mediaAssets.status,
            thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
          },
        })
        .from(notifications)
        .innerJoin(posts, eq(posts.id, notifications.postId))
        .innerJoin(boxes, eq(boxes.id, posts.boxId))
        .leftJoin(
          lifeUpdateDeliveries,
          eq(lifeUpdateDeliveries.postId, notifications.postId),
        )
        .leftJoin(
          postReactions,
          and(
            eq(notifications.type, 'post.reaction'),
            eq(postReactions.postId, notifications.postId),
            eq(postReactions.userId, notifications.actorUserId),
          ),
        )
        .leftJoin(
          commentReactions,
          and(
            eq(notifications.type, 'comment.reaction'),
            eq(commentReactions.commentId, notifications.commentId),
            eq(commentReactions.userId, notifications.actorUserId),
          ),
        )
        .leftJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
        .where(
          and(
            visibleTo(viewerId),
            afterCursor(
              notifications.createdAt,
              notifications.id,
              cursor,
              'desc',
            ),
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.limit + 1),
      this.unreadCount(viewerId),
    ]);
    const visible = rows.slice(0, query.limit);
    // Signed only after every check above, and only for camera reactions.
    const [actors, thumbnails] = await Promise.all([
      this.people.summaries(visible.map((row) => row.notification.actorUserId)),
      Promise.all(
        visible.map((row) => this.mediaUrls.signThumbnail(row.image)),
      ),
    ]);
    const thumbnailOf = new Map(
      visible.map((row, index) => [row.notification.id, thumbnails[index]]),
    );
    const page = pageOf(
      rows,
      query.limit,
      (row) => ({ at: row.at, id: row.notification.id }),
      (row) => {
        const actor = actors.get(row.notification.actorUserId);
        if (!actor) return null;
        return toNotificationView({
          ...row,
          actor,
          thumbnailUrl: thumbnailOf.get(row.notification.id) ?? null,
        });
      },
    );
    return {
      items: page.items.filter((item) => item !== null),
      nextCursor: page.nextCursor,
      unreadCount,
    };
  }

  /**
   * Bounded: it runs on every signed-in page, so it never counts past
   * `UNREAD_COUNT_CAP` (`capped` says there may be more).
   */
  public async unreadCount(viewerId: string): Promise<UnreadCount> {
    const unread = this.database
      .select({ one: sql`1` })
      .from(notifications)
      .where(and(visibleTo(viewerId), isNull(notifications.readAt)))
      .limit(UNREAD_COUNT_CAP + 1)
      .as('unread');
    const [row] = await this.database.select({ value: count() }).from(unread);
    const value = row?.value ?? 0;
    return {
      count: Math.min(value, UNREAD_COUNT_CAP),
      capped: value > UNREAD_COUNT_CAP,
    };
  }

  /** One notification the viewer may see now, or undefined (never a hint). */
  public async findVisible(
    executor: DatabaseExecutor,
    viewerId: string,
    notificationId: string,
  ): Promise<{ id: string; readAt: Date | null } | undefined> {
    const [row] = await executor
      .select({ id: notifications.id, readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), visibleTo(viewerId)))
      .limit(1);
    return row;
  }
}
