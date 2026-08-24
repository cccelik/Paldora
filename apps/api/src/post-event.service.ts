import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  INTERACTION_EVENT_CHANNEL,
  POST_EVENT_CHANNEL,
  type BoxId,
  type CommentId,
  type PostId,
  type UserId,
} from '@paldora/domain';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export type PostEventAction = 'created' | 'updated' | 'deleted';

export interface PostEvent {
  id: string;
  action: PostEventAction;
  boxId: BoxId;
  postId: PostId;
  occurredAt: string;
}

export interface PublishPostEventInput {
  action: PostEventAction;
  boxId: BoxId;
  postId: PostId;
}

export interface PostEventPublisher {
  publish(input: PublishPostEventInput): Promise<boolean>;
}

export type InteractionEventAction =
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'reaction.set'
  | 'comment.reaction.set'
  | 'notification.created';

export interface InteractionEvent {
  id: string;
  action: InteractionEventAction;
  boxId: BoxId;
  postId: PostId;
  actorUserId: UserId;
  recipientUserId: UserId;
  commentId?: CommentId | undefined;
  occurredAt: string;
}

export const POST_EVENT_PUBLISHER = Symbol('POST_EVENT_PUBLISHER');

@Injectable()
export class PostEventService
  implements PostEventPublisher, OnApplicationShutdown
{
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Set<(event: PostEvent) => void>();
  private readonly interactionListeners = new Set<
    (event: InteractionEvent) => void
  >();
  private subscription: Promise<void> | null = null;

  public constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required');
    const options = {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    } as const;
    this.publisher = new Redis(redisUrl, options);
    this.subscriber = new Redis(redisUrl, options);
    this.publisher.on('error', () => undefined);
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('message', (channel, payload) => {
      if (channel === POST_EVENT_CHANNEL) {
        const event = parsePostEvent(payload);
        if (event) for (const listener of this.listeners) listener(event);
      }
      if (channel === INTERACTION_EVENT_CHANNEL) {
        const event = parseInteractionEvent(payload);
        if (event) {
          for (const listener of this.interactionListeners) listener(event);
        }
      }
    });
  }

  public async publish(input: PublishPostEventInput): Promise<boolean> {
    const event: PostEvent = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    try {
      await connect(this.publisher);
      await this.publisher.publish(POST_EVENT_CHANNEL, JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }

  public async subscribe(
    listener: (event: PostEvent) => void,
  ): Promise<() => void> {
    this.listeners.add(listener);
    try {
      await this.ensureSubscribed();
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
    return () => this.listeners.delete(listener);
  }

  public async publishInteraction(event: InteractionEvent): Promise<boolean> {
    try {
      await connect(this.publisher);
      await this.publisher.publish(
        INTERACTION_EVENT_CHANNEL,
        JSON.stringify(event),
      );
      return true;
    } catch {
      return false;
    }
  }

  public async subscribeInteractions(
    listener: (event: InteractionEvent) => void,
  ): Promise<() => void> {
    this.interactionListeners.add(listener);
    try {
      await this.ensureSubscribed();
    } catch (error) {
      this.interactionListeners.delete(listener);
      throw error;
    }
    return () => this.interactionListeners.delete(listener);
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all([close(this.publisher), close(this.subscriber)]);
  }

  private ensureSubscribed(): Promise<void> {
    this.subscription ??= (async () => {
      await connect(this.subscriber);
      await this.subscriber.subscribe(
        POST_EVENT_CHANNEL,
        INTERACTION_EVENT_CHANNEL,
      );
    })().catch((error: unknown) => {
      this.subscription = null;
      throw error;
    });
    return this.subscription;
  }
}

function parseInteractionEvent(payload: string): InteractionEvent | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== 'object') return null;
    const event = value as Record<string, unknown>;
    if (
      typeof event.id !== 'string' ||
      ![
        'comment.created',
        'comment.updated',
        'comment.deleted',
        'reaction.set',
        'comment.reaction.set',
        'notification.created',
      ].includes(String(event.action)) ||
      typeof event.boxId !== 'string' ||
      typeof event.postId !== 'string' ||
      typeof event.actorUserId !== 'string' ||
      typeof event.recipientUserId !== 'string' ||
      typeof event.occurredAt !== 'string'
    ) {
      return null;
    }
    return event as unknown as InteractionEvent;
  } catch {
    return null;
  }
}

function parsePostEvent(payload: string): PostEvent | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== 'object') return null;
    const event = value as Record<string, unknown>;
    if (
      typeof event.id !== 'string' ||
      !['created', 'updated', 'deleted'].includes(String(event.action)) ||
      typeof event.boxId !== 'string' ||
      typeof event.postId !== 'string' ||
      typeof event.occurredAt !== 'string'
    ) {
      return null;
    }
    return {
      id: event.id,
      action: event.action as PostEventAction,
      boxId: event.boxId as BoxId,
      postId: event.postId as PostId,
      occurredAt: event.occurredAt,
    };
  } catch {
    return null;
  }
}

async function connect(connection: Redis): Promise<void> {
  if (connection.status === 'wait') await connection.connect();
}

async function close(connection: Redis): Promise<void> {
  if (connection.status !== 'end') await connection.quit();
}
