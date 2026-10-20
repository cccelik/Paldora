import type { DerivativeSpec, MediaPurposePolicy } from '@paldora/domain';
import sharp, { type Sharp } from 'sharp';

export interface EncodedImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface Derivatives {
  readonly master: EncodedImage;
  readonly display: EncodedImage;
  readonly thumbnail: EncodedImage;
}

/** The input is not an image this purpose accepts; retrying cannot help. */
export class UndecodableImageError extends Error {
  public constructor() {
    super('The upload is not a decodable image of an allowed type.');
    this.name = 'UndecodableImageError';
  }
}

/** Decoded formats we accept, regardless of the declared MIME type. */
const allowedFormats = new Set(['jpeg', 'png', 'webp']);

/**
 * `square` and `cover` crop to exact dimensions around the most detailed
 * region (a small input is upscaled to fill them); `inside` only shrinks.
 */
function resize(source: Sharp, spec: DerivativeSpec): Sharp {
  switch (spec.fit) {
    case 'square':
      return source.resize(spec.size, spec.size, {
        fit: 'cover',
        position: sharp.strategy.attention,
      });
    case 'cover':
      return source.resize(spec.size, spec.height, {
        fit: 'cover',
        position: sharp.strategy.attention,
      });
    case 'inside':
      return source.resize(spec.size, spec.size, {
        fit: 'inside',
        withoutEnlargement: true,
      });
  }
}

async function encode(
  source: Sharp,
  spec: DerivativeSpec,
): Promise<EncodedImage> {
  const resized = resize(source, spec);
  // Sharp writes no EXIF, XMP, IPTC, or ICC metadata unless asked to, so
  // GPS and camera details never survive into stored derivatives.
  const { data, info } = await resized
    .webp({ quality: spec.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(data),
    width: info.width,
    height: info.height,
  };
}

/**
 * Decodes with strict limits, applies orientation, and produces the D2 master
 * plus display and thumbnail derivatives. The raw upload is discarded by the
 * caller afterwards.
 */
export async function createDerivatives(
  input: Uint8Array,
  policy: MediaPurposePolicy,
): Promise<Derivatives> {
  const decoder = sharp(input, {
    failOn: 'error',
    limitInputPixels: policy.maxInputPixels,
    sequentialRead: true,
  });
  let format: string | undefined;
  try {
    ({ format } = await decoder.metadata());
  } catch {
    throw new UndecodableImageError();
  }
  if (!format || !allowedFormats.has(format)) throw new UndecodableImageError();
  const oriented = decoder.rotate();
  try {
    const [master, display, thumbnail] = await Promise.all([
      encode(oriented.clone(), policy.master),
      encode(oriented.clone(), policy.display),
      encode(oriented.clone(), policy.thumbnail),
    ]);
    return { master, display, thumbnail };
  } catch {
    // Truncated or corrupt pixel data fails here under `failOn: 'error'`.
    throw new UndecodableImageError();
  }
}
