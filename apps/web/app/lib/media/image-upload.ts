import {
  MEDIA_CONTENT_TYPES,
  MEDIA_PURPOSE_POLICIES,
  type MediaContentType,
  type MediaPurpose,
} from '@paldora/domain';
const accepted = new Set<string>(MEDIA_CONTENT_TYPES);

export const AVATAR_ACCEPT = MEDIA_CONTENT_TYPES.join(',');
export const PHOTO_ACCEPT = AVATAR_ACCEPT;

/** Mirrors the server policy so people hear about a bad file immediately. */
export function mediaFileProblem(
  file: Pick<File, 'type' | 'size'>,
  purpose: MediaPurpose,
): string | null {
  if (!accepted.has(file.type)) return 'Choose a JPEG, PNG, or WebP photo.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MEDIA_PURPOSE_POLICIES[purpose].maxBytes) {
    const megabytes = MEDIA_PURPOSE_POLICIES[purpose].maxBytes / 1024 / 1024;
    return `Choose a photo up to ${megabytes.toLocaleString('en')} MB.`;
  }
  return null;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Reads the decoded pixel size in the browser; null when it can't be read. */
export async function decodeImageSize(file: Blob): Promise<ImageSize | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export const tooManyPixelsMessage = (maxInputPixels: number) =>
  `That photo is too large in pixels (max ${Math.floor(maxInputPixels / 1_000_000)} megapixels). Try a smaller one.`;

/**
 * Mirrors the server's pixel limit. An unreadable size is not a verdict: the
 * server stays the authority, so this returns null and lets it decide.
 */
export async function mediaDimensionProblem(
  file: Blob,
  purpose: MediaPurpose,
  decode: (file: Blob) => Promise<ImageSize | null> = decodeImageSize,
): Promise<string | null> {
  const limit = MEDIA_PURPOSE_POLICIES[purpose].maxInputPixels;
  const size = await decode(file);
  if (size && size.width * size.height > limit) {
    return tooManyPixelsMessage(limit);
  }
  return null;
}

/** Type, size and pixel checks in one step, for every upload purpose. */
export async function checkMediaFile(
  file: Pick<File, 'type' | 'size'> & Blob,
  purpose: MediaPurpose,
  decode?: (file: Blob) => Promise<ImageSize | null>,
): Promise<string | null> {
  return (
    mediaFileProblem(file, purpose) ??
    (await mediaDimensionProblem(file, purpose, decode))
  );
}

export const avatarFileProblem = (file: Pick<File, 'type' | 'size'>) =>
  mediaFileProblem(file, 'avatar');
export const photoFileProblem = (file: Pick<File, 'type' | 'size'>) =>
  mediaFileProblem(file, 'post_image');

export const asContentType = (type: string) => type as MediaContentType;

/** PUTs the file to the signed URL with exactly the signed headers. */
export async function putToSignedUrl(
  file: Blob,
  upload: { url: string; headers: Readonly<Record<string, string>> },
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const response = await fetchImplementation(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: file,
    // Same-origin Firebase uploads need the HttpOnly session cookie. Cross-origin
    // legacy signed URLs still receive no credentials with this fetch mode.
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new UploadRejectedError(
      response.status,
      await rejectionCode(response),
    );
  }
}

/** The upload route's non-sensitive reason code, when it sent one. */
async function rejectionCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

export class UploadRejectedError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super('Upload rejected by storage.');
  }
}

const rejectionMessages: Readonly<Record<string, string>> = {
  TOO_MANY_PIXELS: 'That photo is too large in pixels. Try a smaller one.',
  WRONG_TYPE:
    'That file isn’t the kind of photo it says it is. Try another one.',
  UNDECODABLE: 'That file couldn’t be read as a photo. Try another one.',
};

/** A stable, user-facing sentence for a failed upload, or the caller's fallback. */
export function uploadFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof UploadRejectedError && error.code) {
    return rejectionMessages[error.code] ?? fallback;
  }
  return fallback;
}
