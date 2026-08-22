import { describe, expect, it } from 'vitest';
import {
  createAvatarUploadSchema,
  cursorPageSchema,
  isReservedUsername,
  normalizeUsername,
  updateProfileSchema,
  usernameSchema,
} from './index.js';

describe('cursorPageSchema', () => {
  it('applies a bounded default page size', () => {
    expect(cursorPageSchema.parse({})).toEqual({ limit: 20 });
    expect(() => cursorPageSchema.parse({ limit: 51 })).toThrow();
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
