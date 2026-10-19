import { describe, expect, it } from 'vitest';
import {
  bioSchema,
  isReservedUsername,
  normalizeUsername,
  updateProfileSchema,
  usernameSchema,
} from './identity.js';
import { createMediaUploadSchema } from './media.js';

describe('normalizeUsername', () => {
  it.each([
    ['Zoë', 'zoe'],
    ['  CamelCase  ', 'camelcase'],
    ['ıstanbul', 'istanbul'],
    ['Ａｂｃ', 'abc'],
    ['José_99', 'jose_99'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it('treats reserved names case- and accent-insensitively', () => {
    expect(isReservedUsername('Ädmin')).toBe(true);
    expect(isReservedUsername('Settings')).toBe(true);
    expect(isReservedUsername('celik')).toBe(false);
  });
});

describe('usernameSchema', () => {
  it.each(['ab', 'a'.repeat(31), 'no spaces', 'dash-name', 'emoji😀'])(
    'rejects %s',
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(['zoë', 'user_1', 'Çelik', '名前です'])('accepts %s', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });
});

describe('updateProfileSchema', () => {
  it('requires at least one field and rejects unknown ones', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ displayName: 'A', role: 'admin' })
        .success,
    ).toBe(false);
  });

  it('trims values and turns an empty bio into null', () => {
    expect(
      updateProfileSchema.parse({ displayName: '  Ada  ', bio: '   ' }),
    ).toEqual({ displayName: 'Ada', bio: null });
    expect(bioSchema.parse(null)).toBeNull();
  });
});

describe('createMediaUploadSchema', () => {
  const valid = {
    purpose: 'avatar',
    contentType: 'image/png',
    contentLength: 1024,
  };

  it('accepts an avatar within policy', () => {
    expect(createMediaUploadSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { ...valid, purpose: 'post_image' },
    { ...valid, contentType: 'image/gif' },
    { ...valid, contentType: 'image/svg+xml' },
    { ...valid, contentLength: 0 },
    { ...valid, contentLength: 10 * 1024 * 1024 + 1 },
    { ...valid, objectKey: 'avatars/someone-else.png' },
  ])('rejects %o', (value) => {
    expect(createMediaUploadSchema.safeParse(value).success).toBe(false);
  });
});
