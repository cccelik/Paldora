import { describe, expect, it } from 'vitest';
import { readEventStream } from './event-stream';
import { backoffDelay, parseHint, shouldRefresh } from './realtime';

const BOX = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';
const POST = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of readEventStream(stream)) events.push(event);
  return events;
}

describe('readEventStream', () => {
  it('parses events split across chunks, with CRLF, comments, and multi-line data', async () => {
    const events = await collect(
      streamOf(
        'event: post.created\ndata: {"a"',
        ':1}\n\n: keep-alive\n\nevent: ping\r\ndata: x\r\n',
        'data: y\r\n\r\ndata: bare\n\n',
      ),
    );
    expect(events).toEqual([
      { event: 'post.created', data: '{"a":1}' },
      { event: 'ping', data: 'x\ny' },
      { event: 'message', data: 'bare' },
    ]);
  });

  it('ignores an unfinished trailing event', async () => {
    expect(
      await collect(streamOf('event: a\ndata: 1\n\nevent: b\ndata: 2')),
    ).toEqual([{ event: 'a', data: '1' }]);
  });
});

describe('parseHint', () => {
  it('keeps IDs only, lowercased', () => {
    expect(
      parseHint(
        JSON.stringify({
          type: 'post.created',
          boxId: BOX.toUpperCase(),
          content: 'no',
        }),
      ),
    ).toEqual({
      type: 'post.created',
      boxId: BOX,
    });
  });

  it.each(['', 'not json', '{"type":3}', 'null'])('rejects %j', (data) => {
    expect(parseHint(data)).toBeNull();
  });
});

describe('shouldRefresh', () => {
  it('refreshes Home for any post change', () => {
    expect(shouldRefresh('/home', { type: 'post.created', boxId: BOX })).toBe(
      true,
    );
  });

  it('refreshes a Box page only for that Box', () => {
    expect(
      shouldRefresh(`/boxes/${BOX}`, { type: 'post.updated', boxId: BOX }),
    ).toBe(true);
    expect(
      shouldRefresh(`/boxes/${POST}`, { type: 'post.updated', boxId: BOX }),
    ).toBe(false);
  });

  it('refreshes a post page only for that post', () => {
    expect(
      shouldRefresh(`/posts/${POST}`, {
        type: 'post.deleted',
        postId: POST,
        boxId: BOX,
      }),
    ).toBe(true);
    expect(
      shouldRefresh(`/posts/${BOX}`, { type: 'post.deleted', postId: POST }),
    ).toBe(false);
  });

  it('refreshes membership-shaped pages on membership changes and nothing else', () => {
    for (const path of ['/home', '/boxes', `/boxes/${BOX}`]) {
      expect(shouldRefresh(path, { type: 'memberships.changed' })).toBe(true);
    }
    expect(
      shouldRefresh('/settings/account', { type: 'memberships.changed' }),
    ).toBe(false);
    expect(
      shouldRefresh('/friends', { type: 'post.created', boxId: BOX }),
    ).toBe(false);
    expect(shouldRefresh('/home', { type: 'ping' })).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('grows, stays within half to full of its ceiling, and caps at 30 seconds', () => {
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(0, () => 1)).toBe(1_000);
    expect(backoffDelay(3, () => 1)).toBe(8_000);
    expect(backoffDelay(20, () => 1)).toBe(30_000);
    expect(backoffDelay(20, () => 0)).toBe(15_000);
  });
});
