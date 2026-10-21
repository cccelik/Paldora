import type { UserId } from '@paldora/domain';
import { MemoryObjectStorage } from '@paldora/storage';
import type { CreateMediaUploadInput } from '@paldora/validation';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../platform/http/api-error.js';
import type { PaldoraDatabase } from '@paldora/database';
import type { RateLimiter } from '../platform/rate-limit/rate-limiter.js';
import { MediaUploadService } from './media-upload.service.js';

const userId = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10' as UserId;

/**
 * No Box is named, so a reservation that gets past the purpose limit stops at
 * the scope check (BOX_NOT_FOUND) before touching the database.
 */
const input = (purpose: 'post_image' | 'reaction_image') =>
  ({
    purpose,
    contentType: 'image/jpeg',
    contentLength: 1_000,
  }) as CreateMediaUploadInput;

function service(consume: RateLimiter['consume']) {
  const limiter = { consume: vi.fn(consume) };
  const uploads = new MediaUploadService(
    {} as PaldoraDatabase,
    new MemoryObjectStorage(),
    limiter,
  );
  return { uploads, limiter };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: ApiError) => error.code,
  );

describe('camera upload limit', () => {
  it('counts camera reservations under their own scope', async () => {
    const { uploads, limiter } = service(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
    }));
    expect(await codeOf(uploads.create(userId, input('reaction_image')))).toBe(
      'BOX_NOT_FOUND',
    );
    expect(limiter.consume).toHaveBeenCalledWith(`user:${userId}`, {
      scope: 'camera-upload',
      limit: 120,
      windowSeconds: 3_600,
    });
  });

  it('refuses camera reservations over the limit', async () => {
    const { uploads } = service(async () => ({
      allowed: false,
      retryAfterSeconds: 30,
    }));
    expect(await codeOf(uploads.create(userId, input('reaction_image')))).toBe(
      'RATE_LIMITED',
    );
  });

  it('fails closed when the limit cannot be enforced', async () => {
    const { uploads } = service(async () => {
      throw new Error('redis down');
    });
    expect(await codeOf(uploads.create(userId, input('reaction_image')))).toBe(
      'RATE_LIMIT_UNAVAILABLE',
    );
  });

  it('leaves other purposes to the route limit alone', async () => {
    const { uploads, limiter } = service(async () => {
      throw new Error('never called');
    });
    expect(await codeOf(uploads.create(userId, input('post_image')))).toBe(
      'BOX_NOT_FOUND',
    );
    expect(limiter.consume).not.toHaveBeenCalled();
  });
});

describe('Life Update photo upload limit', () => {
  const lifeUpdatePhoto = {
    purpose: 'life_update_image',
    contentType: 'image/jpeg',
    contentLength: 1_000,
  } as CreateMediaUploadInput;

  it('counts reservations under their own scope, failing closed', async () => {
    const { uploads, limiter } = service(async () => ({
      allowed: false,
      retryAfterSeconds: 30,
    }));
    expect(await codeOf(uploads.create(userId, lifeUpdatePhoto))).toBe(
      'RATE_LIMITED',
    );
    expect(limiter.consume).toHaveBeenCalledWith(`user:${userId}`, {
      scope: 'life-update-upload',
      limit: 120,
      windowSeconds: 3_600,
    });
    const down = service(async () => {
      throw new Error('redis down');
    });
    expect(await codeOf(down.uploads.create(userId, lifeUpdatePhoto))).toBe(
      'RATE_LIMIT_UNAVAILABLE',
    );
  });
});

describe('Room banner upload limit', () => {
  const banner = {
    purpose: 'room_banner',
    contentType: 'image/png',
    contentLength: 1_000,
  } as CreateMediaUploadInput;

  it('counts reservations under their own scope, failing closed', async () => {
    const { uploads, limiter } = service(async () => ({
      allowed: false,
      retryAfterSeconds: 30,
    }));
    expect(await codeOf(uploads.create(userId, banner))).toBe('RATE_LIMITED');
    expect(limiter.consume).toHaveBeenCalledWith(`user:${userId}`, {
      scope: 'room-banner-upload',
      limit: 20,
      windowSeconds: 3_600,
    });
    const down = service(async () => {
      throw new Error('redis down');
    });
    expect(await codeOf(down.uploads.create(userId, banner))).toBe(
      'RATE_LIMIT_UNAVAILABLE',
    );
  });
});
