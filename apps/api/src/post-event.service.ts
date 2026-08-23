import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { BoxId, PostId } from '@paldora/domain';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

const POST_EVENT_CHANNEL = 'paldora:post-events:v1';

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

export const POST_EVENT_PUBLISHER = Symbol('POST_EVENT_PUBLISHER');

@Injectable()
export class PostEventService
  implements PostEventPublisher, OnApplicationShutdown
{
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Set<(event: PostEvent) => void>();
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
      if (channel !== POST_EVENT_CHANNEL) return;
      const event = parsePostEvent(payload);
      if (!event) return;
      for (const listener of this.listeners) listener(event);
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

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all([close(this.publisher), close(this.subscriber)]);
  }

  private ensureSubscribed(): Promise<void> {
    this.subscription ??= (async () => {
      await connect(this.subscriber);
      await this.subscriber.subscribe(POST_EVENT_CHANNEL);
    })().catch((error: unknown) => {
      this.subscription = null;
      throw error;
    });
    return this.subscription;
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
