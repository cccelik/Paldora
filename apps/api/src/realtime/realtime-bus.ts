import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from '@paldora/observability';
import {
  boxChannel,
  realtimeEventSchema,
  userChannel,
  type RealtimeEvent,
} from '@paldora/validation';
import type { Redis } from 'ioredis';
import type { Infrastructure } from '../platform/db/infrastructure.service.js';
import { redisReady } from '../platform/db/redis-ready.js';
import { INFRASTRUCTURE, LOGGER } from '../platform/config/tokens.js';

// Channel names live in the contract package so the worker shares them.
export { boxChannel, userChannel } from '@paldora/validation';

type Handler = (event: RealtimeEvent) => void;
type EventType = RealtimeEvent['type'];

/** The IDs a Box hint names: always the post, sometimes a comment. */
export interface BoxEventIds {
  readonly postId: string;
  readonly commentId?: string;
}

/** One backing post of a Life Update in one Box. */
export interface DeliveryRef {
  readonly boxId: string;
  readonly postId: string;
}

/**
 * Redis pub/sub for invalidation hints (R5). One subscriber connection serves
 * every stream in this process: channels are reference-counted, so a thousand
 * viewers of one Box cost one Redis subscription and no per-event database
 * work. Messages carry IDs only. Publishing is best effort by design: a lost
 * hint is repaired by the `resync` event every connection starts with.
 */
@Injectable()
export class RealtimeBus implements OnApplicationShutdown {
  private subscriber: Redis | undefined;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly downListeners = new Set<() => void>();

  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  public async publish(
    channel: string,
    event: Omit<RealtimeEvent, 'at'>,
  ): Promise<void> {
    try {
      const message: RealtimeEvent = { ...event, at: new Date().toISOString() };
      // A hint published before anything else used Redis would otherwise be
      // dropped on the not-yet-open lazy connection.
      await redisReady(this.infrastructure.redis);
      await this.infrastructure.redis.publish(channel, JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ err: error, channel }, 'realtime publish failed');
    }
  }

  /**
   * One hint to a Box's members: `{ type, boxId, postId, commentId? }`,
   * after commit and best effort. IDs only, never content.
   */
  public boxEvent(
    boxId: string,
    type: EventType,
    ids: BoxEventIds,
  ): Promise<void> {
    return this.publish(boxChannel(boxId), { type, boxId, ...ids });
  }

  /** The same hint for each delivery of a Life Update, in its own Box. */
  public async announceDeliveries(
    type: EventType,
    deliveries: readonly DeliveryRef[],
  ): Promise<void> {
    await Promise.all(
      deliveries.map(({ boxId, postId }) =>
        this.boxEvent(boxId, type, { postId }),
      ),
    );
  }

  /** One hint to one person: just the type. */
  public userEvent(userId: string, type: EventType): Promise<void> {
    return this.publish(userChannel(userId), { type });
  }

  /** Tells each person to recompute which Boxes they belong to. */
  public async membershipsChanged(userIds: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        this.userEvent(userId, 'memberships.changed'),
      ),
    );
  }

  /** Returns an unsubscribe function. */
  public async subscribe(
    channel: string,
    handler: Handler,
  ): Promise<() => void> {
    const subscriber = this.connect();
    let group = this.handlers.get(channel);
    if (!group) {
      group = new Set();
      this.handlers.set(channel, group);
      await subscriber.subscribe(channel);
    }
    group.add(handler);
    return () => {
      const current = this.handlers.get(channel);
      if (!current?.delete(handler) || current.size > 0) return;
      this.handlers.delete(channel);
      subscriber.unsubscribe(channel).catch(() => undefined);
    };
  }

  /** Called when the subscriber connection drops; streams end so clients resync. */
  public onDown(listener: () => void): () => void {
    this.downListeners.add(listener);
    return () => this.downListeners.delete(listener);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  private connect(): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.infrastructure.redis.duplicate({
      lazyConnect: false,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });
    subscriber.on('error', () => undefined);
    subscriber.on('message', (channel: string, message: string) =>
      this.dispatch(channel, message),
    );
    subscriber.on('close', () => {
      // Messages sent while disconnected are gone; end every stream so the
      // clients reconnect and resync instead of trusting a silent gap.
      this.handlers.clear();
      for (const listener of this.downListeners) listener();
      this.subscriber = undefined;
      subscriber.disconnect();
    });
    this.subscriber = subscriber;
    return subscriber;
  }

  private dispatch(channel: string, message: string): void {
    let event: RealtimeEvent;
    try {
      event = realtimeEventSchema.parse(JSON.parse(message));
    } catch {
      return;
    }
    for (const handler of this.handlers.get(channel) ?? []) handler(event);
  }
}
