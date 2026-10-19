import { describe, expect, it } from 'vitest';
import { MEDIA_PURPOSE_POLICIES } from './media.js';

describe('reaction_image policy', () => {
  it('is Box-scoped, smaller than post photos, and resized inside the frame', () => {
    const policy = MEDIA_PURPOSE_POLICIES.reaction_image;
    expect(policy.scope).toBe('box');
    expect(policy.maxBytes).toBe(5 * 1024 * 1024);
    expect(policy.maxInputPixels).toBe(25_000_000);
    expect(
      [policy.master, policy.display, policy.thumbnail].map((spec) => [
        spec.size,
        spec.fit,
      ]),
    ).toEqual([
      [1280, 'inside'],
      [1024, 'inside'],
      [320, 'inside'],
    ]);
    expect(policy.maxBytes).toBeLessThan(
      MEDIA_PURPOSE_POLICIES.post_image.maxBytes,
    );
  });
});
