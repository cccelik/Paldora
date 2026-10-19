import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createDerivatives, UndecodableImageError } from './derivatives.js';

const policy = MEDIA_PURPOSE_POLICIES.avatar;

/** A camera-like JPEG: EXIF with GPS and a rotated orientation. */
async function cameraJpeg(width = 1200, height = 800): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'TestCam', Model: 'Secret Model' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 31/1 0/1' },
    })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('createDerivatives', () => {
  it('starts from a fixture that really carries camera metadata', async () => {
    const metadata = await sharp(await cameraJpeg()).metadata();
    expect(metadata.orientation).toBe(6);
    expect(metadata.exif?.includes('Secret Model')).toBe(true);
  });

  it('produces bounded WebP derivatives with no metadata', async () => {
    const result = await createDerivatives(await cameraJpeg(), policy);
    for (const image of [result.master, result.display, result.thumbnail]) {
      const metadata = await sharp(image.bytes).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(Buffer.from(image.bytes).includes('Secret Model')).toBe(false);
    }
    expect(result.display).toMatchObject({ width: 512, height: 512 });
    expect(result.thumbnail).toMatchObject({ width: 160, height: 160 });
  });

  it('bounds camera reactions to the reaction_image sizes, inside-fit', async () => {
    const result = await createDerivatives(
      await cameraJpeg(3000, 2000),
      MEDIA_PURPOSE_POLICIES.reaction_image,
    );
    // Orientation 6: the 3000×2000 capture is stored portrait.
    expect(result.master).toMatchObject({ width: 853, height: 1280 });
    expect(result.display).toMatchObject({ width: 683, height: 1024 });
    expect(result.thumbnail).toMatchObject({ width: 213, height: 320 });
    for (const image of [result.master, result.display, result.thumbnail]) {
      expect((await sharp(image.bytes).metadata()).exif).toBeUndefined();
    }
  });

  it('applies EXIF orientation before stripping it', async () => {
    const { master } = await createDerivatives(
      await cameraJpeg(1200, 800),
      policy,
    );
    // Orientation 6 rotates 90°, so the stored master is portrait.
    expect(master).toMatchObject({ width: 800, height: 1200 });
  });

  it('never enlarges small masters', async () => {
    const small = new Uint8Array(
      await sharp({
        create: { width: 40, height: 30, channels: 3, background: '#fff' },
      })
        .png()
        .toBuffer(),
    );
    const { master } = await createDerivatives(small, policy);
    expect(master).toMatchObject({ width: 40, height: 30 });
  });

  it.each([
    ['random bytes', new Uint8Array(512).fill(9)],
    [
      'an SVG',
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ],
  ])('rejects %s as undecodable', async (_name, bytes) => {
    await expect(createDerivatives(bytes, policy)).rejects.toBeInstanceOf(
      UndecodableImageError,
    );
  });

  it('rejects truncated images', async () => {
    const jpeg = await cameraJpeg();
    await expect(
      createDerivatives(jpeg.slice(0, jpeg.byteLength / 2), policy),
    ).rejects.toBeInstanceOf(UndecodableImageError);
  });

  it('rejects images beyond the decoded-pixel limit', async () => {
    const huge = new Uint8Array(
      await sharp({
        create: { width: 8000, height: 6000, channels: 3, background: '#000' },
      })
        .jpeg({ quality: 10 })
        .toBuffer(),
    );
    await expect(
      createDerivatives(huge, { ...policy, maxInputPixels: 40_000_000 }),
    ).rejects.toBeInstanceOf(UndecodableImageError);
  });
});
