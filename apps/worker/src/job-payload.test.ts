import { describe, expect, it } from 'vitest';
import { parseMediaAssetId } from './job-payload.js';

describe('parseMediaAssetId', () => {
  it('accepts a UUID and rejects untrusted object keys or malformed ids', () => {
    expect(
      parseMediaAssetId({
        mediaAssetId: '0198d447-ecb2-7bf2-9f0d-b2dd38be8107',
        objectKey: 'avatars/someone-else/private.webp',
      }),
    ).toBe('0198d447-ecb2-7bf2-9f0d-b2dd38be8107');
    expect(() => parseMediaAssetId({ mediaAssetId: '../object' })).toThrow(
      'Invalid delete-media-object job payload',
    );
  });
});
