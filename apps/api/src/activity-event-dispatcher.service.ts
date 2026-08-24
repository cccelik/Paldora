import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  activityEvents,
  boxMemberships,
  friendships,
  notifications,
  posts,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  BoxId,
  CommentId,
  NotificationType,
  PostId,
  UserId,
} from '@paldora/domain';
import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';
import {
  PostEventService,
  type InteractionEvent,
} from './post-event.service.js';

@Injectable()
export class ActivityEventDispatcher
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ActivityEventDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private flushing = false;

  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(PostEventService)
    private readonly realtime: PostEventService,
  ) {}

  public onModuleInit(): void {
    void this.flush();
    this.timer = setInterval(() => void this.flush(), 500);
    this.timer.unref();
  }

  public async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const events = await this.claimPendingEvents();
      await Promise.all(events.map((event) => this.project(event)));
    } catch (error) {
      this.logger.error('Activity event projection failed.', error);
    } finally {
      this.flushing = false;
    }
  }

  public onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private claimPendingEvents() {
    const now = new Date();
    const staleLock = new Date(now.getTime() - 60_000);
    return this.infrastructure.databaseClient.transaction(
      async (transaction) => {
        const events = await transaction
          .select()
          .from(activityEvents)
          .where(
            and(
              isNull(activityEvents.processedAt),
              lte(activityEvents.availableAt, now),
              or(
                isNull(activityEvents.lockedAt),
                lt(activityEvents.lockedAt, staleLock),
              ),
            ),
          )
          .orderBy(asc(activityEvents.createdAt))
          .limit(50)
          .for('update', { skipLocked: true });
        if (events.length > 0) {
          await transaction
            .update(activityEvents)
            .set({ lockedAt: now, updatedAt: now })
            .where(
              inArray(
                activityEvents.id,
                events.map(({ id }) => id),
              ),
            );
        }
        return events;
      },
    );
  }

  private async project(event: typeof activityEvents.$inferSelect) {
    const database = this.infrastructure.databaseClient;
    try {
      let notificationCreated = false;
      await database.transaction(async (transaction) => {
        const notificationType = notificationTypeFor(event);
        const recipientUserId = event.payload.recipientUserId as UserId;
        if (
          notificationType &&
          recipientUserId !== (event.actorUserId as UserId) &&
          (await notificationIsVisible(
            transaction,
            recipientUserId,
            event.actorUserId as UserId,
            event.payload.postId as PostId,
          ))
        ) {
          const inserted = await transaction
            .insert(notifications)
            .values({
              recipientUserId,
              actorUserId: event.actorUserId,
              activityEventId: event.id,
              dedupeKey: notificationDedupeKey(event, notificationType),
              type: notificationType,
              postId: event.payload.postId,
              commentId: event.payload.commentId,
            })
            .onConflictDoNothing({ target: notifications.dedupeKey })
            .returning({ id: notifications.id });
          notificationCreated = inserted.length > 0;
        }
        await transaction
          .update(activityEvents)
          .set({
            attempts: event.attempts + 1,
            processedAt: new Date(),
            lockedAt: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(activityEvents.id, event.id));
      });
      const base: InteractionEvent = {
        id: event.id,
        action: event.type,
        boxId: event.payload.boxId as BoxId,
        postId: event.payload.postId as PostId,
        actorUserId: event.actorUserId as UserId,
        recipientUserId: event.payload.recipientUserId as UserId,
        ...(event.payload.commentId
          ? { commentId: event.payload.commentId as CommentId }
          : {}),
        occurredAt: event.createdAt.toISOString(),
      };
      await this.realtime.publishInteraction(base);
      if (notificationCreated) {
        await this.realtime.publishInteraction({
          ...base,
          id: `${event.id}:notification`,
          action: 'notification.created',
        });
      }
    } catch (error) {
      const attempts = event.attempts + 1;
      const delay = Math.min(60_000, 500 * 2 ** Math.min(attempts, 7));
      await database
        .update(activityEvents)
        .set({
          attempts,
          availableAt: new Date(Date.now() + delay),
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : String(error),
          updatedAt: new Date(),
        })
        .where(eq(activityEvents.id, event.id));
    }
  }
}

function notificationTypeFor(
  event: typeof activityEvents.$inferSelect,
): NotificationType | null {
  if (event.type === 'comment.created') {
    return event.payload.parentCommentId ? 'comment.reply' : 'post.comment';
  }
  if (event.type === 'reaction.set' && event.payload.reactionKind) {
    return 'post.reaction';
  }
  if (event.type === 'comment.reaction.set' && event.payload.reactionKind) {
    return 'comment.reaction';
  }
  return null;
}

function notificationDedupeKey(
  event: typeof activityEvents.$inferSelect,
  type: NotificationType,
): string {
  return type === 'post.reaction'
    ? `post:${event.payload.postId}:reaction:${event.actorUserId}`
    : type === 'comment.reaction'
      ? `comment:${event.payload.commentId}:reaction:${event.actorUserId}`
      : `comment:${event.payload.commentId}:notification`;
}

async function notificationIsVisible(
  transaction: Parameters<Parameters<PaldoraDatabase['transaction']>[0]>[0],
  recipientUserId: UserId,
  actorUserId: UserId,
  postId: PostId,
): Promise<boolean> {
  const [visiblePost] = await transaction
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(
      boxMemberships,
      and(
        eq(boxMemberships.boxId, posts.boxId),
        eq(boxMemberships.userId, recipientUserId),
        eq(boxMemberships.status, 'active'),
      ),
    )
    .where(and(eq(posts.id, postId), eq(posts.status, 'active')))
    .limit(1);
  if (!visiblePost) return false;
  const low = recipientUserId < actorUserId ? recipientUserId : actorUserId;
  const high = recipientUserId < actorUserId ? actorUserId : recipientUserId;
  const [relationship] = await transaction
    .select({ status: friendships.status })
    .from(friendships)
    .where(
      and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
    )
    .limit(1);
  return relationship?.status !== 'blocked';
}
