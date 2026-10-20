/**
 * The media purpose policy table (R4). Every upload names a purpose, and the
 * API and worker read its rules from here: what may be uploaded, how large,
 * and which metadata-free derivatives the worker produces. Adding a purpose
 * means adding a row here and widening the `media_assets_purpose_check`
 * constraint in a migration.
 */
export const MEDIA_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number];

export const MEDIA_STATUSES = [
  'pending',
  'processing',
  'ready',
  'failed',
  'deleted',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export interface DerivativeSpec {
  /** Longest edge in pixels for `inside`; edge length for `square`. */
  readonly size: number;
  readonly fit: 'inside' | 'square';
  readonly quality: number;
}

/** Where an upload lives: with its owner alone, or inside one Box. */
export type MediaScope = 'user' | 'box';

export interface MediaPurposePolicy {
  readonly scope: MediaScope;
  readonly contentTypes: readonly MediaContentType[];
  readonly maxBytes: number;
  /** Upper bound on decoded pixels, checked before any resize work. */
  readonly maxInputPixels: number;
  /**
   * D2: the raw upload is deleted after processing; this re-encoded,
   * metadata-free master is the long-term copy.
   */
  readonly master: DerivativeSpec;
  readonly display: DerivativeSpec;
  readonly thumbnail: DerivativeSpec;
}

const megabytes = (count: number) => count * 1024 * 1024;

export const MEDIA_PURPOSES = [
  'avatar',
  'post_image',
  'reaction_image',
  'life_update_image',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_PURPOSE_POLICIES: Readonly<
  Record<MediaPurpose, MediaPurposePolicy>
> = {
  avatar: {
    scope: 'user',
    contentTypes: MEDIA_CONTENT_TYPES,
    maxBytes: megabytes(10),
    maxInputPixels: 40_000_000,
    master: { size: 2048, fit: 'inside', quality: 86 },
    display: { size: 512, fit: 'square', quality: 82 },
    thumbnail: { size: 160, fit: 'square', quality: 78 },
  },
  post_image: {
    scope: 'box',
    contentTypes: MEDIA_CONTENT_TYPES,
    maxBytes: megabytes(10),
    maxInputPixels: 40_000_000,
    master: { size: 2560, fit: 'inside', quality: 86 },
    display: { size: 1600, fit: 'inside', quality: 82 },
    thumbnail: { size: 640, fit: 'inside', quality: 78 },
  },
  /**
   * Camera reactions (Phase 5): one capture per person per post, visible to
   * exactly the people who can see the post. Smaller than post photos.
   */
  reaction_image: {
    scope: 'box',
    contentTypes: MEDIA_CONTENT_TYPES,
    maxBytes: megabytes(5),
    maxInputPixels: 25_000_000,
    master: { size: 1280, fit: 'inside', quality: 86 },
    display: { size: 1024, fit: 'inside', quality: 82 },
    thumbnail: { size: 320, fit: 'inside', quality: 78 },
  },
  /**
   * Life Update photos (Phase 6): stored once and shown in every delivery
   * Box, so they belong to their owner, not to a Box. Same limits and
   * derivatives as post photos.
   */
  life_update_image: {
    scope: 'user',
    contentTypes: MEDIA_CONTENT_TYPES,
    maxBytes: megabytes(10),
    maxInputPixels: 40_000_000,
    master: { size: 2560, fit: 'inside', quality: 86 },
    display: { size: 1600, fit: 'inside', quality: 82 },
    thumbnail: { size: 640, fit: 'inside', quality: 78 },
  },
};

/** A ready photo nobody attached to a post is removed after this long. */
export const UNATTACHED_MEDIA_TTL_SECONDS = 24 * 60 * 60;

/** Signed uploads are bound to exact MIME and length and expire quickly. */
export const SIGNED_UPLOAD_TTL_SECONDS = 300;
/**
 * Completion stays possible for a while after the signed PUT expires, because
 * a slow upload that started in time may still be finishing. After this the
 * reaper expires the reservation and deletes whatever arrived.
 */
export const UPLOAD_COMPLETION_GRACE_SECONDS = 15 * 60;
/** Signed reads of derivatives. */
export const SIGNED_READ_TTL_SECONDS = 900;

export const MEDIA_JOB_TYPES = ['media.process', 'media.delete'] as const;
export type MediaJobType = (typeof MEDIA_JOB_TYPES)[number];
