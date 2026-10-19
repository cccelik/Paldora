import type { NotificationView } from '@paldora/validation';
import { describe, expect, it } from 'vitest';
import {
  notificationHref,
  notificationSentence,
  unreadBadge,
  unreadLabel,
} from './notification-text';

const POST = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
const COMMENT = '3b9f0f2a-1c4d-4e5f-8a6b-7c8d9e0f1a2b';

function notification(
  change: Partial<NotificationView> = {},
): NotificationView {
  return {
    id: '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10',
    type: 'post.comment',
    actor: {
      id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
      username: 'ada',
      displayName: 'Ada',
      avatarUrl: null,
    },
    postId: POST,
    commentId: COMMENT,
    box: { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Weekend crew' },
    reaction: null,
    read: false,
    createdAt: '2026-10-19T10:00:00.000Z',
    ...change,
  };
}

describe('notificationSentence', () => {
  it('reads naturally for every type', () => {
    expect(notificationSentence(notification())).toBe(
      'Ada commented on your post in Weekend crew',
    );
    expect(notificationSentence(notification({ type: 'comment.reply' }))).toBe(
      'Ada replied to your comment in Weekend crew',
    );
    expect(
      notificationSentence(
        notification({
          type: 'post.reaction',
          commentId: null,
          reaction: { kind: '🎉' },
        }),
      ),
    ).toBe('Ada reacted 🎉 to your post in Weekend crew');
    expect(
      notificationSentence(
        notification({ type: 'comment.reaction', reaction: { kind: '❤️' } }),
      ),
    ).toBe('Ada reacted ❤️ to your comment in Weekend crew');
    expect(
      notificationSentence(
        notification({ type: 'post.reaction', reaction: { kind: 'real' } }),
      ),
    ).toBe('Ada sent a camera reaction to your post in Weekend crew');
  });
});

describe('notificationHref', () => {
  it('pins the comment when there is one', () => {
    expect(notificationHref({ postId: POST, commentId: COMMENT })).toBe(
      `/posts/${POST}?comment=${COMMENT}#comment-${COMMENT}`,
    );
    expect(notificationHref({ postId: POST, commentId: null })).toBe(
      `/posts/${POST}`,
    );
  });
});

describe('unread badge and label', () => {
  it('shows nothing at zero and 99+ past 99', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(3)).toBe('3');
    expect(unreadBadge(99)).toBe('99');
    expect(unreadBadge(100)).toBe('99+');
    expect(unreadLabel(0)).toBe('Notifications');
    expect(unreadLabel(3)).toBe('Notifications, 3 unread');
    expect(unreadLabel(100, true)).toBe('Notifications, 99+ unread');
  });
});
