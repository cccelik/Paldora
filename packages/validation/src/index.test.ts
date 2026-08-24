import { describe, expect, it } from 'vitest';
import {
  createBoxInvitationSchema,
  createBoxSchema,
  createAvatarUploadSchema,
  createFriendRequestSchema,
  createLifeUpdateSchema,
  createPostSchema,
  createCommentSchema,
  cursorPageSchema,
  isReservedUsername,
  isSingleEmoji,
  normalizeUsername,
  setPostReactionSchema,
  setCommentReactionSchema,
  transferBoxOwnershipSchema,
  updateProfileSchema,
  updateLifeUpdateSchema,
  usernameSchema,
} from './index.js';

describe('cursorPageSchema', () => {
  it('applies a bounded default page size', () => {
    expect(cursorPageSchema.parse({})).toEqual({ limit: 20 });
    expect(() => cursorPageSchema.parse({ limit: 51 })).toThrow();
  });
});

describe('Phase 6 Life Update validation', () => {
  const boxId = (suffix: number) =>
    `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

  it('requires content and keeps Only Me exclusive from Box audiences', () => {
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'only_me' },
        sections: { lifeLately: 'A quiet week.' },
      }).success,
    ).toBe(true);
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'only_me', boxIds: [boxId(1)] },
        sections: {},
      }).success,
    ).toBe(false);
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'boxes', boxIds: [boxId(1)] },
        sections: {},
      }).success,
    ).toBe(false);
  });

  it('deduplicates Boxes and enforces the 20-Box limit', () => {
    const sections = { travel: 'Somewhere new.' };
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'boxes', boxIds: [boxId(1), boxId(1)] },
        sections,
      }).success,
    ).toBe(false);
    expect(
      createLifeUpdateSchema.safeParse({
        audience: {
          type: 'boxes',
          boxIds: Array.from({ length: 21 }, (_, index) => boxId(index + 1)),
        },
        sections,
      }).success,
    ).toBe(false);
  });

  it('enforces section, aggregate, photo, and edit bounds', () => {
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'only_me' },
        sections: { reading: 'x'.repeat(2_001) },
      }).success,
    ).toBe(false);
    expect(
      createLifeUpdateSchema.safeParse({
        audience: { type: 'only_me' },
        sections: {
          lifeLately: 'x'.repeat(2_000),
          workOrUniversity: 'x'.repeat(2_000),
          travel: 'x'.repeat(2_000),
          listeningTo: 'x'.repeat(2_000),
          watching: 'x'.repeat(2_000),
          reading: 'x',
        },
      }).success,
    ).toBe(false);
    expect(
      updateLifeUpdateSchema.safeParse({
        sections: {},
        mediaAssetIds: Array.from({ length: 5 }, (_, index) =>
          boxId(index + 1),
        ),
      }).success,
    ).toBe(false);
  });
});

describe('Phase 5 interaction validation', () => {
  it('trims comments and enforces content and reply ID bounds', () => {
    expect(createCommentSchema.parse({ content: '  hello  ' })).toEqual({
      content: 'hello',
    });
    expect(createCommentSchema.safeParse({ content: '   ' }).success).toBe(
      false,
    );
    expect(
      createCommentSchema.safeParse({ content: 'x'.repeat(2_001) }).success,
    ).toBe(false);
    expect(
      createCommentSchema.safeParse({
        content: 'reply',
        parentCommentId: 'not-a-comment',
      }).success,
    ).toBe(false);
  });

  it('accepts explicit reaction state and removal only', () => {
    expect(setPostReactionSchema.parse({ kind: '😮' })).toEqual({
      kind: '😮',
    });
    expect(setPostReactionSchema.parse({ kind: null })).toEqual({ kind: null });
    expect(
      setPostReactionSchema.safeParse({
        kind: 'real',
        mediaAssetId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(setPostReactionSchema.safeParse({ kind: 'real' }).success).toBe(
      false,
    );
    expect(
      setPostReactionSchema.safeParse({
        kind: '❤️',
        mediaAssetId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(setPostReactionSchema.safeParse({ kind: 'angry' }).success).toBe(
      false,
    );
  });

  it('accepts emoji comment reactions but not camera markers', () => {
    expect(setCommentReactionSchema.parse({ kind: '🥳' })).toEqual({
      kind: '🥳',
    });
    expect(setCommentReactionSchema.parse({ kind: null })).toEqual({
      kind: null,
    });
    expect(setCommentReactionSchema.safeParse({ kind: 'real' }).success).toBe(
      false,
    );
  });

  it('accepts one complete Unicode emoji and rejects text or emoji pairs', () => {
    expect(isSingleEmoji('👍🏽')).toBe(true);
    expect(isSingleEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isSingleEmoji('🇹🇷')).toBe(true);
    expect(isSingleEmoji('👍❤️')).toBe(false);
    expect(isSingleEmoji('like')).toBe(false);
  });
});

describe('username validation', () => {
  it('normalizes equivalent Turkish and ASCII usernames identically', () => {
    expect(normalizeUsername('Çelik')).toBe('celik');
    expect(normalizeUsername('CELIK')).toBe('celik');
    expect(normalizeUsername('celik')).toBe('celik');
    expect(normalizeUsername('IŞIK_34')).toBe('isik_34');
  });

  it('supports Unicode letters while rejecting punctuation and bounds', () => {
    expect(usernameSchema.safeParse('arkadaş_34').success).toBe(true);
    expect(usernameSchema.safeParse('a!').success).toBe(false);
    expect(usernameSchema.safeParse('x'.repeat(31)).success).toBe(false);
  });

  it('blocks normalized reserved names', () => {
    expect(isReservedUsername('ADMIN')).toBe(true);
    expect(isReservedUsername('friendly_person')).toBe(false);
  });
});

describe('profile and avatar validation', () => {
  it('requires at least one bounded profile field', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ displayName: 'A'.repeat(81) }).success,
    ).toBe(false);
  });

  it('requires five distinct emoji reaction presets', () => {
    expect(
      updateProfileSchema.safeParse({
        reactionPresets: ['👍', '❤️', '😂', '😮', '🙏'],
      }).success,
    ).toBe(true);
    expect(
      updateProfileSchema.safeParse({
        reactionPresets: ['👍', '👍', '😂', '😮', '🙏'],
      }).success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({
        reactionPresets: ['👍', '❤️', '😂', '😮'],
      }).success,
    ).toBe(false);
  });

  it('accepts supported avatar uploads and rejects oversized files', () => {
    expect(
      createAvatarUploadSchema.safeParse({
        contentType: 'image/webp',
        contentLength: 1_024,
      }).success,
    ).toBe(true);
    expect(
      createAvatarUploadSchema.safeParse({
        contentType: 'image/gif',
        contentLength: 1_024,
      }).success,
    ).toBe(false);
  });
});

describe('Boxes and social validation', () => {
  it('accepts a named Box and rejects empty or oversized names', () => {
    expect(createBoxSchema.parse({ name: 'Weekend crew' })).toEqual({
      name: 'Weekend crew',
    });
    expect(createBoxSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createBoxSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(
      false,
    );
  });

  it('applies username rules to invitations and friend requests', () => {
    expect(
      createBoxInvitationSchema.safeParse({ username: 'arkadaş_34' }).success,
    ).toBe(true);
    expect(
      createFriendRequestSchema.safeParse({ username: 'not.valid' }).success,
    ).toBe(false);
  });

  it('requires a valid member ID for ownership transfer', () => {
    expect(
      transferBoxOwnershipSchema.safeParse({
        userId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      transferBoxOwnershipSchema.safeParse({ userId: 'not-a-user' }).success,
    ).toBe(false);
  });

  it('bounds and trims text posts', () => {
    expect(createPostSchema.parse({ content: '  hello Box  ' })).toEqual({
      content: 'hello Box',
      mediaAssetIds: [],
    });
    expect(createPostSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(
      createPostSchema.safeParse({ content: 'x'.repeat(5_001) }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({
        content: '',
        mediaAssetIds: ['00000000-0000-4000-8000-000000000001'],
      }).success,
    ).toBe(true);
    expect(
      createPostSchema.safeParse({
        content: '',
        mediaAssetIds: Array.from(
          { length: 5 },
          (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`,
        ),
      }).success,
    ).toBe(false);
  });
});
