import type { BoxId, PostId } from '@paldora/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PostEvent, PostEventService } from '../src/post-event.service.js';

const redisUrl = process.env.REDIS_URL;

describe.runIf(Boolean(redisUrl))('Redis post events', () => {
  let events: PostEventService;

  beforeAll(() => {
    events = new PostEventService();
  });

  afterAll(async () => events.onApplicationShutdown());

  it('delivers metadata-only events across the shared channel', async () => {
    const boxId = '00000000-0000-4000-8000-000000000001' as BoxId;
    const postId = '00000000-0000-4000-8000-000000000002' as PostId;
    let receive: (event: PostEvent) => void = () => undefined;
    const received = new Promise<PostEvent>((resolve) => {
      receive = resolve;
    });
    const stop = await events.subscribe(receive);
    await expect(
      events.publish({ action: 'created', boxId, postId }),
    ).resolves.toBe(true);
    await expect(withTimeout(received)).resolves.toMatchObject({
      action: 'created',
      boxId,
      postId,
      id: expect.any(String),
      occurredAt: expect.any(String),
    });
    stop();
  });
});

function withTimeout<Value>(promise: Promise<Value>): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Post event was not delivered.')),
      3_000,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
