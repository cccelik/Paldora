import { readEventStream } from '@/lib/realtime/event-stream';
import {
  backoffDelay,
  concernsPosts,
  isInteractionHint,
  isNotificationHint,
  isRoomCustomizer,
  parseHint,
  shouldRefresh,
  shouldResync,
} from '@/lib/realtime/realtime';
import { describe, expect, it } from 'vitest';
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

  it('refreshes Room pages on membership and post changes, never on interactions', () => {
    for (const path of ['/rooms/ada', '/rooms/ada/memories']) {
      expect(shouldRefresh(path, { type: 'memberships.changed' }), path).toBe(
        true,
      );
      expect(
        shouldRefresh(path, { type: 'post.deleted', boxId: BOX, postId: POST }),
        path,
      ).toBe(true);
      expect(
        shouldRefresh(path, { type: 'reaction.changed', postId: POST }),
        path,
      ).toBe(false);
      expect(shouldRefresh(path, { type: 'notification.created' }), path).toBe(
        false,
      );
    }
    expect(shouldRefresh('/roomsx', { type: 'memberships.changed' })).toBe(
      false,
    );
  });

  it('never refreshes the Room customizer, so unsaved drafts survive', () => {
    for (const path of ['/rooms/ada/customize', '/Rooms/Ada/Customize']) {
      for (const hint of [
        { type: 'memberships.changed' },
        { type: 'post.created', boxId: BOX, postId: POST },
        { type: 'post.deleted', boxId: BOX, postId: POST },
      ]) {
        expect(shouldRefresh(path, hint), `${path} ${hint.type}`).toBe(false);
      }
      expect(shouldResync(path), path).toBe(false);
    }
    expect(isRoomCustomizer('/rooms/ada/customize')).toBe(true);
    expect(isRoomCustomizer('/rooms/customize')).toBe(false);
    expect(isRoomCustomizer('/rooms/ada')).toBe(false);
    expect(shouldResync('/rooms/ada')).toBe(true);
    expect(shouldResync('/home')).toBe(true);
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

describe('Life Update pages', () => {
  const OTHER = '3b9f0f2a-1c4d-4e5f-8a6b-7c8d9e0f1a2b';

  it('refreshes the list for post changes and every Life Update page for membership changes', () => {
    expect(
      shouldRefresh('/life-updates', { type: 'post.deleted', boxId: BOX }),
    ).toBe(true);
    expect(
      shouldRefresh(`/life-updates/${POST}`, { type: 'memberships.changed' }),
    ).toBe(true);
    expect(
      shouldRefresh('/life-updates/new', { type: 'memberships.changed' }),
    ).toBe(true);
  });

  it('lets a page that shows backing posts refresh only for those posts', () => {
    const shown = new Set([POST]);
    for (const type of ['post.updated', 'post.deleted', 'comment.created']) {
      expect(concernsPosts(shown, { type, postId: POST, boxId: BOX })).toBe(
        true,
      );
    }
    expect(
      concernsPosts(shown, { type: 'comment.created', postId: OTHER }),
    ).toBe(false);
    expect(concernsPosts(shown, { type: 'notification.created' })).toBe(false);
    expect(
      concernsPosts(shown, { type: 'notification.created', postId: POST }),
    ).toBe(false);
  });
});

describe('Memories pages', () => {
  it('refresh personal Memories for any post change and Box Memories only for that Box', () => {
    const hint = { type: 'post.deleted', boxId: BOX, postId: POST };
    expect(shouldRefresh('/memories', hint)).toBe(true);
    expect(shouldRefresh('/memories/2026/3', hint)).toBe(true);
    expect(shouldRefresh(`/boxes/${BOX}/memories`, hint)).toBe(true);
    expect(shouldRefresh(`/boxes/${POST}/memories`, hint)).toBe(false);
    expect(
      shouldRefresh('/memories/2026', {
        type: 'comment.created',
        postId: POST,
      }),
    ).toBe(false);
  });

  it('refresh every Memories page when memberships change', () => {
    for (const path of [
      '/memories',
      '/memories/2026',
      `/boxes/${BOX}/memories`,
    ]) {
      expect(shouldRefresh(path, { type: 'memberships.changed' })).toBe(true);
    }
  });
});

describe('interaction and notification hints', () => {
  const COMMENT = '3b9f0f2a-1c4d-4e5f-8a6b-7c8d9e0f1a2b';

  it('keeps comment and notification IDs', () => {
    expect(
      parseHint(
        JSON.stringify({
          type: 'comment.created',
          boxId: BOX,
          postId: POST,
          commentId: COMMENT.toUpperCase(),
          notificationId: COMMENT,
          emoji: '👍',
        }),
      ),
    ).toEqual({
      type: 'comment.created',
      boxId: BOX,
      postId: POST,
      commentId: COMMENT,
      notificationId: COMMENT,
    });
  });

  it('never refreshes Home or a Box page for comments and reactions', () => {
    for (const type of [
      'comment.created',
      'comment.updated',
      'comment.deleted',
      'reaction.changed',
    ]) {
      const hint = { type, boxId: BOX, postId: POST, commentId: COMMENT };
      expect(isInteractionHint(hint)).toBe(true);
      expect(shouldRefresh('/home', hint)).toBe(false);
      expect(shouldRefresh(`/boxes/${BOX}`, hint)).toBe(false);
      expect(shouldRefresh(`/posts/${POST}`, hint)).toBe(true);
      expect(shouldRefresh(`/posts/${BOX}`, hint)).toBe(false);
    }
  });

  it('refreshes only the notifications page for notification hints', () => {
    for (const type of ['notification.created', 'notifications.changed']) {
      const hint = { type, postId: POST, notificationId: COMMENT };
      expect(isNotificationHint(hint)).toBe(true);
      expect(isInteractionHint(hint)).toBe(false);
      expect(shouldRefresh('/notifications', hint)).toBe(true);
      expect(shouldRefresh('/home', hint)).toBe(false);
      expect(shouldRefresh(`/posts/${POST}`, hint)).toBe(false);
    }
    expect(isNotificationHint({ type: 'post.created' })).toBe(false);
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
