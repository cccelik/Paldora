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
  boxes,
  friendships,
  lifeUpdateDeliveries,
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
      if (event.type === 'life_update.published') {
        await this.projectLifeUpdatePublication(event);
        return;
      }
      const recipient = event.payload.recipientUserId;
      const postId = event.payload.postId;
      const boxId = event.payload.boxId;
      if (!recipient || !postId || !boxId) {
        throw new Error('Interaction activity event payload is incomplete.');
      }
      const recipientUserId = recipient as UserId;
      let notificationCreated = false;
      await database.transaction(async (transaction) => {
        const notificationType = notificationTypeFor(event);
        if (
          notificationType &&
          recipientUserId !== (event.actorUserId as UserId) &&
          (await notificationIsVisible(
            transaction,
            recipientUserId,
            event.actorUserId as UserId,
            postId as PostId,
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
              postId,
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
        boxId: boxId as BoxId,
        postId: postId as PostId,
        actorUserId: event.actorUserId as UserId,
        recipientUserId: recipientUserId,
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

  private async projectLifeUpdatePublication(
    event: typeof activityEvents.$inferSelect,
  ): Promise<void> {
    const lifeUpdateId = event.payload.lifeUpdateId;
    const boxIds = event.payload.boxIds ?? [];
    if (!lifeUpdateId) {
      throw new Error('Life Update publication event payload is incomplete.');
    }
    const database = this.infrastructure.databaseClient;
    const created = await database.transaction(async (transaction) => {
      const candidates =
        boxIds.length === 0
          ? []
          : await transaction
              .select({
                recipientUserId: boxMemberships.userId,
                postId: lifeUpdateDeliveries.postId,
                boxId: lifeUpdateDeliveries.boxId,
              })
              .from(lifeUpdateDeliveries)
              .innerJoin(boxes, eq(boxes.id, lifeUpdateDeliveries.boxId))
              .innerJoin(
                boxMemberships,
                and(
                  eq(boxMemberships.boxId, lifeUpdateDeliveries.boxId),
                  eq(boxMemberships.status, 'active'),
                ),
              )
              .where(
                and(
                  eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId),
                  inArray(lifeUpdateDeliveries.boxId, boxIds),
                ),
              )
              .orderBy(asc(boxes.name), asc(lifeUpdateDeliveries.boxId));
      const firstContextByRecipient = new Map<
        string,
        (typeof candidates)[number]
      >();
      for (const candidate of candidates) {
        if (
          candidate.recipientUserId !== event.actorUserId &&
          !firstContextByRecipient.has(candidate.recipientUserId)
        ) {
          firstContextByRecipient.set(candidate.recipientUserId, candidate);
        }
      }
      const visible = (
        await Promise.all(
          [...firstContextByRecipient.values()].map(async (candidate) =>
            candidate.boxId &&
            (await notificationIsVisible(
              transaction,
              candidate.recipientUserId as UserId,
              event.actorUserId as UserId,
              candidate.postId as PostId,
            ))
              ? candidate
              : null,
          ),
        )
      ).filter((candidate) => candidate !== null);
      const inserted =
        visible.length === 0
          ? []
          : await transaction
              .insert(notifications)
              .values(
                visible.map((candidate) => ({
                  recipientUserId: candidate.recipientUserId,
                  actorUserId: event.actorUserId,
                  activityEventId: event.id,
                  dedupeKey: `life-update:${lifeUpdateId}:recipient:${candidate.recipientUserId}`,
                  type: 'life_update.published' as const,
                  postId: candidate.postId,
                  lifeUpdateId,
                })),
              )
              .onConflictDoNothing({ target: notifications.dedupeKey })
              .returning({
                recipientUserId: notifications.recipientUserId,
                postId: notifications.postId,
              });
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
      return inserted.map((item) => ({
        ...item,
        boxId:
          visible.find((candidate) => candidate.postId === item.postId)
            ?.boxId ?? null,
      }));
    });
    await Promise.all(
      created.flatMap((notification) =>
        notification.boxId
          ? [
              this.realtime.publishInteraction({
                id: `${event.id}:notification:${notification.recipientUserId}`,
                action: 'notification.created',
                boxId: notification.boxId as BoxId,
                postId: notification.postId as PostId,
                actorUserId: event.actorUserId as UserId,
                recipientUserId: notification.recipientUserId as UserId,
                occurredAt: event.createdAt.toISOString(),
              }),
            ]
          : [],
      ),
    );
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
