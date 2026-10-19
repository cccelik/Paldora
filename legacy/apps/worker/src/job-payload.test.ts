import { describe, expect, it } from 'vitest';
import { parseMediaJobPayload } from './job-payload.js';

const mediaAssetId = '10000000-0000-4000-8000-000000000001';

describe('parseMediaJobPayload', () => {
  it('preserves deletion object snapshots after media metadata is gone', () => {
    expect(
      parseMediaJobPayload({
        mediaAssetId,
        objectKeys: ['original.png', 'display.webp', 'thumbnail.webp'],
      }),
    ).toEqual({
      mediaAssetId,
      objectKeys: ['original.png', 'display.webp', 'thumbnail.webp'],
    });
  });

  it('rejects malformed IDs and object key lists', () => {
    expect(() => parseMediaJobPayload({ mediaAssetId: 'invalid' })).toThrow(
      'Invalid media job payload.',
    );
    expect(() =>
      parseMediaJobPayload({ mediaAssetId, objectKeys: [''] }),
    ).toThrow('Invalid media job object keys.');
  });
});
