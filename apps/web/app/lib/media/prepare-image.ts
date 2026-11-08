import {
  MEDIA_CONTENT_TYPES,
  MEDIA_PURPOSE_POLICIES,
  type MediaPurpose,
} from '@paldora/domain';

/**
 * Browser-side resizing for every photo purpose. A photo that is already
 * within the purpose's long edge, pixel and byte limits is uploaded as is.
 * Anything else is decoded (EXIF orientation applied), downscaled and
 * re-encoded here, so a phone-camera original never has to fit the server
 * limits. The server still validates everything and keeps its pixel cap.
 *
 * Privacy: a re-encoded photo carries no EXIF or GPS data from the original.
 * An untouched photo does, until the worker strips it.
 */

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** A decoded photo, oriented as the person sees it. */
export interface DecodedImage extends PixelSize {
  /** Whether any pixel is not fully opaque. */
  hasAlpha(): Promise<boolean>;
  /** Draws at `target` and encodes; null when the browser can't. */
  encode(
    target: PixelSize,
    type: string,
    quality: number,
  ): Promise<Blob | null>;
  close(): void;
}

/** Null when the browser can't decode the file (or can't afford to). */
export type DecodeImage = (file: Blob) => Promise<DecodedImage | null>;

export const RESIZE_QUALITY = 0.88;
/** Re-encode attempts: each one shrinks the photo further when bytes don't fit. */
const MAX_ATTEMPTS = 4;
const SHRINK_PER_ATTEMPT = 0.8;
const MIN_EDGE = 64;

export type PreparedMedia =
  | { readonly ok: true; readonly file: File; readonly resized: boolean }
  | { readonly ok: false; readonly problem: string };

export const notAPhotoMessage = 'Choose a JPEG, PNG, or WebP photo.';
export const emptyFileMessage = 'That file is empty.';
export const tooLargeMessage = (maxBytes: number) =>
  `Choose a photo up to ${(maxBytes / 1024 / 1024).toLocaleString('en')} MB.`;
export const cannotShrinkMessage =
  'That photo couldn’t be made small enough. Try a smaller one.';
export const cannotPrepareMessage =
  'That photo couldn’t be prepared. Try another one.';

const accepted = new Set<string>(MEDIA_CONTENT_TYPES);

/**
 * The scale (at most 1) that brings `size` within the long edge and pixel
 * limits, keeping the aspect ratio.
 */
export function scaleToFit(
  size: PixelSize,
  maxLongEdge: number,
  maxPixels: number,
): number {
  const longest = Math.max(size.width, size.height);
  const pixels = size.width * size.height;
  if (longest <= 0 || pixels <= 0) return 1;
  return Math.min(1, maxLongEdge / longest, Math.sqrt(maxPixels / pixels));
}

/** The target size for `scale`, never below 1 px and never rounded up past the limits. */
export function scaledSize(size: PixelSize, scale: number): PixelSize {
  if (scale >= 1) return size;
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
}

function withExtension(name: string, type: string): string {
  const extension = type === 'image/png' ? 'png' : type.split('/')[1];
  const stem = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${stem}.${extension}`;
}

/** Formats to try, best first. PNG is kept only for transparent photos. */
const formatsFor = (alpha: boolean): readonly string[] =>
  alpha ? ['image/png', 'image/webp'] : ['image/webp', 'image/jpeg'];

async function encodeWithin(
  image: DecodedImage,
  target: PixelSize,
  alpha: boolean,
  maxBytes: number,
): Promise<Blob | null> {
  for (const type of formatsFor(alpha)) {
    // Browsers silently fall back to PNG for formats they can't write, so
    // only a blob of the requested type counts.
    // eslint-disable-next-line no-await-in-loop -- sequential: stop at the first format that fits
    const blob = await image
      .encode(target, type, RESIZE_QUALITY)
      .catch(() => null);
    if (blob && blob.type === type && blob.size > 0 && blob.size <= maxBytes) {
      return blob;
    }
  }
  return null;
}

async function resizeToFit(
  image: DecodedImage,
  file: File,
  start: number,
  maxBytes: number,
): Promise<PreparedMedia> {
  const alpha =
    file.type === 'image/png'
      ? await image.hasAlpha().catch(() => true)
      : false;
  let scale = start;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const target = scaledSize(image, scale);
    if (Math.max(target.width, target.height) < MIN_EDGE) break;
    // eslint-disable-next-line no-await-in-loop -- each attempt depends on the previous result
    const blob = await encodeWithin(image, target, alpha, maxBytes);
    if (blob) {
      const out = new File([blob], withExtension(file.name, blob.type), {
        type: blob.type,
        lastModified: file.lastModified,
      });
      return { ok: true, file: out, resized: true };
    }
    scale *= SHRINK_PER_ATTEMPT;
  }
  return { ok: false, problem: cannotShrinkMessage };
}

/** The browser decoder: createImageBitmap plus a canvas. */
export const decodeInBrowser: DecodeImage = async (file) => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  return browserImage(file, bitmap);
};

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(size: PixelSize): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size.width, size.height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function canvasBlob(
  canvas: Canvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });
  }
  return canvas.convertToBlob({ type, quality });
}

/** A smaller decode straight from the file, when the browser honours it exactly. */
async function decodeAt(file: Blob, target: PixelSize) {
  try {
    const small = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
    });
    // Engines differ on whether resize applies before orientation: trust it
    // only when the result is exactly the oriented target.
    if (small.width === target.width && small.height === target.height) {
      return small;
    }
    small.close();
  } catch {
    // Unsupported options: draw from the full decode instead.
  }
  return null;
}

function browserImage(file: Blob, bitmap: ImageBitmap): DecodedImage {
  return {
    width: bitmap.width,
    height: bitmap.height,
    async hasAlpha() {
      const probe = makeCanvas(
        scaledSize(bitmap, 256 / Math.max(bitmap.width, bitmap.height)),
      );
      const context = probe.getContext('2d', { willReadFrequently: true }) as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!context) return true;
      context.drawImage(bitmap, 0, 0, probe.width, probe.height);
      const { data } = context.getImageData(0, 0, probe.width, probe.height);
      for (let index = 3; index < data.length; index += 4) {
        if ((data[index] ?? 255) < 255) return true;
      }
      return false;
    },
    async encode(target, type, quality) {
      const canvas = makeCanvas(target);
      const context = canvas.getContext('2d') as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!context) return null;
      context.imageSmoothingQuality = 'high';
      const exact =
        target.width === bitmap.width && target.height === bitmap.height
          ? null
          : await decodeAt(file, target);
      context.drawImage(exact ?? bitmap, 0, 0, target.width, target.height);
      exact?.close();
      return canvasBlob(canvas, type, quality);
    },
    close: () => bitmap.close(),
  };
}

/**
 * Checks a photo against its purpose's policy and, when it is too large in
 * pixels, long edge or bytes, resizes it. Returns the file to upload, or a
 * stable message when no usable file can be made.
 *
 * An undecodable file within the byte limit is passed on unchanged: the
 * server stays the authority (it rejects it with a precise reason).
 */
export async function prepareMediaFile(
  file: File,
  purpose: MediaPurpose,
  decode: DecodeImage = decodeInBrowser,
): Promise<PreparedMedia> {
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  if (!accepted.has(file.type)) return { ok: false, problem: notAPhotoMessage };
  if (file.size <= 0) return { ok: false, problem: emptyFileMessage };

  const image = await decode(file).catch(() => null);
  if (!image) {
    return file.size > policy.maxBytes
      ? { ok: false, problem: tooLargeMessage(policy.maxBytes) }
      : { ok: true, file, resized: false };
  }
  try {
    const scale = scaleToFit(image, policy.maxLongEdge, policy.maxInputPixels);
    if (scale >= 1 && file.size <= policy.maxBytes) {
      return { ok: true, file, resized: false };
    }
    const result = await resizeToFit(image, file, scale, policy.maxBytes);
    return result.ok ? result : { ok: false, problem: result.problem };
  } catch {
    return { ok: false, problem: cannotPrepareMessage };
  } finally {
    image.close();
  }
}
