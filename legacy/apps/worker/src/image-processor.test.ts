import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processPostImage } from './image-processor.js';

describe('processPostImage', () => {
  it('creates bounded display and thumbnail WebP variants', async () => {
    const original = await sharp({
      create: {
        width: 2_000,
        height: 1_000,
        channels: 3,
        background: '#73539b',
      },
    })
      .jpeg()
      .toBuffer();
    const result = await processPostImage(original);
    expect({ width: result.width, height: result.height }).toEqual({
      width: 1_600,
      height: 800,
    });
    await expect(sharp(result.display).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 1_600,
      height: 800,
    });
    await expect(sharp(result.thumbnail).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 640,
      height: 320,
    });
  });
});
