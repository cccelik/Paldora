import type { PostId } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import { decodePostCursor, encodePostCursor } from '../src/post-cursor.js';

const postId = '00000000-0000-4000-8000-000000000001' as PostId;

describe('post cursors', () => {
  it('round-trips an opaque chronological cursor', () => {
    const createdAt = new Date('2026-08-23T12:00:00.000Z');
    expect(decodePostCursor(encodePostCursor(createdAt, postId))).toEqual({
      createdAt,
      id: postId,
    });
  });

  it('rejects malformed cursors with a stable code', () => {
    try {
      decodePostCursor('not-a-cursor');
      throw new Error('Expected the cursor to be rejected.');
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          error: {
            code: 'INVALID_CURSOR',
            message: 'That pagination cursor is invalid.',
          },
        },
        status: 400,
      });
    }
  });
});
