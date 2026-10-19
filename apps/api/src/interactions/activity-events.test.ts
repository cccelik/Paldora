import { describe, expect, it } from 'vitest';
import { dedupeKeyOf } from './activity-events.js';

describe('activity dedupe keys', () => {
  const base = { actorUserId: 'a1', postId: 'p1' };

  it('match the notification each event projects to', () => {
    expect(
      dedupeKeyOf({
        ...base,
        type: 'comment.created',
        commentId: 'c1',
        isReply: false,
      }),
    ).toBe('post.comment:c1');
    expect(
      dedupeKeyOf({
        ...base,
        type: 'comment.created',
        commentId: 'c2',
        isReply: true,
      }),
    ).toBe('comment.reply:c2');
    expect(dedupeKeyOf({ ...base, type: 'post.reaction.set' })).toBe(
      'post.reaction:p1:a1',
    );
    expect(
      dedupeKeyOf({ ...base, type: 'comment.reaction.set', commentId: 'c1' }),
    ).toBe('comment.reaction:c1:a1');
  });

  it('are per person and target, never per emoji', () => {
    const first = dedupeKeyOf({ ...base, type: 'post.reaction.set' });
    const other = dedupeKeyOf({
      ...base,
      actorUserId: 'a2',
      type: 'post.reaction.set',
    });
    expect(first).not.toBe(other);
  });
});
