import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  lifeUpdateDeliveries,
  notifications,
  posts,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  Notification,
  NotificationId,
  NotificationPage,
  PostId,
  UserId,
} from '@paldora/domain';
import { and, count, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';
import {
  decodeInteractionCursor,
  encodeInteractionCursor,
} from './interaction-cursor.js';
import { ProfileAvatarService } from './profile-avatar.service.js';

@Injectable()
export class NotificationService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async list(
    userId: UserId,
    input: { cursor?: string | undefined; limit: number },
  ): Promise<NotificationPage> {
    const cursor = input.cursor
      ? decodeInteractionCursor(input.cursor)
      : undefined;
    const cursorCondition = cursor
      ? or(
          lt(notifications.createdAt, cursor.createdAt),
          and(
            eq(notifications.createdAt, cursor.createdAt),
            lt(notifications.id, cursor.id),
          ),
        )
      : undefined;
    const visibility = notificationVisibility(userId);
    const [rows, [unread]] = await Promise.all([
      this.database
        .select({
          notification: notifications,
          profile: profiles,
          deliveryLifeUpdateId: lifeUpdateDeliveries.lifeUpdateId,
        })
        .from(notifications)
        .innerJoin(posts, eq(posts.id, notifications.postId))
        .innerJoin(
          boxMemberships,
          and(
            eq(boxMemberships.boxId, posts.boxId),
            eq(boxMemberships.userId, userId),
            eq(boxMemberships.status, 'active'),
          ),
        )
        .innerJoin(profiles, eq(profiles.userId, notifications.actorUserId))
        .leftJoin(
          lifeUpdateDeliveries,
          eq(lifeUpdateDeliveries.postId, notifications.postId),
        )
        .where(and(visibility, cursorCondition))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(input.limit + 1),
      this.database
        .select({ value: count() })
        .from(notifications)
        .innerJoin(posts, eq(posts.id, notifications.postId))
        .innerJoin(
          boxMemberships,
          and(
            eq(boxMemberships.boxId, posts.boxId),
            eq(boxMemberships.userId, userId),
            eq(boxMemberships.status, 'active'),
          ),
        )
        .where(and(visibility, isNull(notifications.readAt))),
    ]);
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const avatarUrls = await this.avatars.forUsers(
      pageRows.map(({ notification }) => notification.actorUserId as UserId),
    );
    const items = pageRows.map(
      ({ notification, profile, deliveryLifeUpdateId }) => ({
        id: notification.id as NotificationId,
        type: notification.type,
        actor: {
          userId: notification.actorUserId as UserId,
          username: profile.username ?? '',
          displayName:
            profile.displayName ?? profile.username ?? 'Paldora member',
          avatarUrl: avatarUrls.get(notification.actorUserId as UserId) ?? null,
        },
        postId: notification.postId as PostId,
        commentId: notification.commentId as Notification['commentId'],
        lifeUpdateId: (notification.lifeUpdateId ??
          deliveryLifeUpdateId) as Notification['lifeUpdateId'],
        read: Boolean(notification.readAt),
        createdAt: notification.createdAt.toISOString(),
      }),
    );
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeInteractionCursor(new Date(last.createdAt), last.id)
          : null,
      unreadCount: Number(unread?.value ?? 0),
    };
  }

  public async unreadCount(userId: UserId): Promise<{ unreadCount: number }> {
    const [row] = await this.database
      .select({ value: count() })
      .from(notifications)
      .innerJoin(posts, eq(posts.id, notifications.postId))
      .innerJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, posts.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(and(notificationVisibility(userId), isNull(notifications.readAt)));
    return { unreadCount: Number(row?.value ?? 0) };
  }

  public async markRead(
    userId: UserId,
    notificationId: NotificationId,
  ): Promise<{ success: true }> {
    await this.database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientUserId, userId),
          isNull(notifications.readAt),
        ),
      );
    return { success: true };
  }

  public async markAllRead(userId: UserId): Promise<{ success: true }> {
    await this.database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientUserId, userId),
          isNull(notifications.readAt),
        ),
      );
    return { success: true };
  }
}

function notificationVisibility(userId: UserId) {
  return and(
    eq(notifications.recipientUserId, userId),
    eq(posts.status, 'active'),
    sql`not exists (
      select 1 from paldora.friendships f
      where f.user_low_id = least(${notifications.actorUserId}, ${userId}::uuid)
        and f.user_high_id = greatest(${notifications.actorUserId}, ${userId}::uuid)
        and f.status = 'blocked'
    )`,
    ne(notifications.actorUserId, userId),
  );
}
