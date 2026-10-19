import { describe, expect, it } from 'vitest';
import { parseServerSentEvents } from './sse';

describe('server-sent event parsing', () => {
  it('keeps partial chunks and parses complete named events', () => {
    const first = parseServerSentEvents(
      'id: event-1\nevent: post.created\ndata: {"postId":"one"}\n\nevent: post.up',
    );
    expect(first.events).toEqual([
      {
        id: 'event-1',
        type: 'post.created',
        data: '{"postId":"one"}',
      },
    ]);
    expect(first.remainder).toBe('event: post.up');

    expect(
      parseServerSentEvents(
        `${first.remainder}dated\r\ndata: {"postId":"two"}\r\n\r\n`,
      ),
    ).toEqual({
      events: [
        {
          id: null,
          type: 'post.updated',
          data: '{"postId":"two"}',
        },
      ],
      remainder: '',
    });
  });
});
