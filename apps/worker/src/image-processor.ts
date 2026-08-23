import sharp from 'sharp';

export interface ProcessedPostImage {
  display: Uint8Array;
  thumbnail: Uint8Array;
  width: number;
  height: number;
}

export async function processPostImage(
  original: Uint8Array,
): Promise<ProcessedPostImage> {
  const display = await sharp(original, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: 1_600,
      height: 1_600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(display.data)
    .resize({ width: 640, height: 640, fit: 'inside' })
    .webp({ quality: 78 })
    .toBuffer();
  return {
    display: display.data,
    thumbnail,
    width: display.info.width,
    height: display.info.height,
  };
}
