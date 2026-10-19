import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  commentItemSchema,
  createCommentSchema,
  updateCommentSchema,
} from './comments.js';
import { realtimeEventSchema } from './events.js';
import {
  reactionPresetsSchema,
  setCommentReactionSchema,
  setPostReactionSchema,
} from './reactions.js';

const ok =
  (schema: { safeParse: (value: unknown) => { success: boolean } }) =>
  (value: unknown) =>
    schema.safeParse(value).success;

describe('setPostReactionSchema', () => {
  const accepts = ok(setPostReactionSchema);
  const asset = randomUUID();

  it('accepts an emoji, a camera image with its upload, and removal', () => {
    expect(accepts({ kind: '👍' })).toBe(true);
    expect(accepts({ kind: '👨‍👩‍👧' })).toBe(true);
    expect(accepts({ kind: 'real', mediaAssetId: asset })).toBe(true);
    expect(accepts({ kind: null })).toBe(true);
  });

  it('requires an upload exactly when the kind is real', () => {
    expect(accepts({ kind: 'real' })).toBe(false);
    expect(accepts({ kind: '👍', mediaAssetId: asset })).toBe(false);
    expect(accepts({ kind: null, mediaAssetId: asset })).toBe(false);
  });

  it('rejects text, several emoji, and unknown fields', () => {
    expect(accepts({ kind: 'like' })).toBe(false);
    expect(accepts({ kind: '👍👍' })).toBe(false);
    expect(accepts({ kind: '👍', extra: true })).toBe(false);
    expect(accepts({})).toBe(false);
  });
});

describe('setCommentReactionSchema', () => {
  it('never accepts a camera reaction', () => {
    const accepts = ok(setCommentReactionSchema);
    expect(accepts({ kind: '😂' })).toBe(true);
    expect(accepts({ kind: null })).toBe(true);
    expect(accepts({ kind: 'real' })).toBe(false);
  });
});

describe('reactionPresetsSchema', () => {
  const accepts = ok(reactionPresetsSchema);

  it('takes five distinct emoji', () => {
    expect(accepts({ presets: ['👍', '❤️', '😂', '😮', '🇹🇷'] })).toBe(true);
    expect(accepts({ presets: ['👍', '👍', '😂', '😮', '😢'] })).toBe(false);
    expect(accepts({ presets: ['👍', '❤️', '😂', '😮'] })).toBe(false);
    expect(accepts({ presets: ['👍', '❤️', '😂', '😮', 'x'] })).toBe(false);
  });
});

describe('comment requests', () => {
  it('trims and bounds the text', () => {
    expect(createCommentSchema.parse({ content: '  hi  ' }).content).toBe('hi');
    expect(ok(createCommentSchema)({ content: '   ' })).toBe(false);
    expect(ok(createCommentSchema)({ content: 'x'.repeat(2001) })).toBe(false);
    expect(ok(updateCommentSchema)({ content: 'x'.repeat(2000) })).toBe(true);
  });

  it('normalizes the parent ID and rejects unknown fields', () => {
    const id = randomUUID();
    expect(
      createCommentSchema.parse({
        content: 'hi',
        parentCommentId: id.toUpperCase(),
      }).parentCommentId,
    ).toBe(id);
    expect(ok(createCommentSchema)({ content: 'hi', postId: id })).toBe(false);
  });
});

describe('comment items', () => {
  it('give hidden and deleted rows no author or text', () => {
    const at = new Date().toISOString();
    const hidden = commentItemSchema.parse({
      kind: 'hidden',
      hidden: { id: randomUUID(), createdAt: at, author: 'leak' },
    });
    expect(JSON.stringify(hidden)).not.toContain('leak');
    const deleted = commentItemSchema.parse({
      kind: 'deleted',
      deleted: {
        id: randomUUID(),
        postId: randomUUID(),
        parentCommentId: null,
        createdAt: at,
        content: 'leak',
      },
    });
    expect(JSON.stringify(deleted)).not.toContain('leak');
  });
});

describe('realtime events', () => {
  it('keeps comment and notification IDs through parsing', () => {
    const commentId = randomUUID();
    const notificationId = randomUUID();
    const event = realtimeEventSchema.parse({
      type: 'comment.created',
      commentId,
      notificationId,
      at: new Date().toISOString(),
    });
    expect(event).toMatchObject({ commentId, notificationId });
  });
});
