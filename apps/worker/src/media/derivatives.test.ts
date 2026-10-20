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

  it('crops Room banners to exact 3:1 covers and keeps the whole master', async () => {
    const result = await createDerivatives(
      await cameraJpeg(3000, 2000),
      MEDIA_PURPOSE_POLICIES.room_banner,
    );
    // Orientation 6: the 3000×2000 capture is portrait (2000×3000).
    expect(result.master).toMatchObject({ width: 1707, height: 2560 });
    expect(result.display).toMatchObject({ width: 1600, height: 533 });
    expect(result.thumbnail).toMatchObject({ width: 640, height: 213 });
    for (const image of [result.master, result.display, result.thumbnail]) {
      const metadata = await sharp(image.bytes).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(Buffer.from(image.bytes).includes('Secret Model')).toBe(false);
      expect(Buffer.from(image.bytes).includes('GPS')).toBe(false);
    }
  });

  it('covers the banner frame even from a small or very wide input', async () => {
    const tiny = new Uint8Array(
      await sharp({
        create: { width: 90, height: 60, channels: 3, background: '#fff' },
      })
        .png()
        .toBuffer(),
    );
    const small = await createDerivatives(
      tiny,
      MEDIA_PURPOSE_POLICIES.room_banner,
    );
    expect(small.master).toMatchObject({ width: 90, height: 60 });
    expect(small.display).toMatchObject({ width: 1600, height: 533 });
    const panorama = new Uint8Array(
      await sharp({
        create: { width: 4000, height: 400, channels: 3, background: '#123' },
      })
        .jpeg()
        .toBuffer(),
    );
    const wide = await createDerivatives(
      panorama,
      MEDIA_PURPOSE_POLICIES.room_banner,
    );
    expect(wide.display).toMatchObject({ width: 1600, height: 533 });
    expect(wide.thumbnail).toMatchObject({ width: 640, height: 213 });
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
