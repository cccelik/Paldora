import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';

/**
 * Authenticated HTTP Functions that carry private media bytes (ADR 021
 * decision 8). They are not callables: native clients send
 * `Authorization: Bearer <Firebase ID token>`. Both apply the callables'
 * session-epoch check, a per-user rate limit and the web `/media` routes'
 * live authorization, and answer absence and denial with the same 404.
 */
export interface NativeHttpEndpoint {
  /** The exported Function name; the URL is `.../{name}{path}`. */
  name: string;
  method: 'PUT' | 'GET';
  /** Path after the Function name; `{...}` segments are parameters. */
  path: string;
  auth: 'Bearer Firebase ID token';
  /** `rateLimits.consume(uid, scope, perHour)`, same window as callables. */
  limit: { scope: string; perHour: number };
  /** Every status the endpoint can return. */
  statuses: Record<string, string>;
  /** Request body limit in bytes (PUT only). */
  maxBodyBytes?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders: Record<string, string>;
  /** GET only: allowed values of a path parameter. */
  variants?: readonly string[];
}

const largestUpload = Math.max(
  ...Object.values(MEDIA_PURPOSE_POLICIES).map((policy) => policy.maxBytes),
);

export const NATIVE_MEDIA_VARIANTS = ['display', 'thumbnail'] as const;

export const nativeHttpEndpoints: readonly NativeHttpEndpoint[] = [
  {
    name: 'mediaUpload',
    method: 'PUT',
    path: '/{assetId}',
    auth: 'Bearer Firebase ID token',
    limit: { scope: 'mediaUpload', perHour: 480 },
    maxBodyBytes: largestUpload,
    requestHeaders: {
      Authorization: 'Bearer <Firebase ID token>',
      'Content-Type':
        'Exactly the contentType reserved by createMediaUpload; body length must equal the reserved contentLength.',
    },
    responseHeaders: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    statuses: {
      '204': 'Bytes accepted; call completeMediaUpload next.',
      '400':
        'Type, length or image content does not match the reservation, or the reservation expired.',
      '401': 'Missing, invalid or ended session.',
      '404':
        'Unknown, foreign, already used or unavailable asset (indistinguishable).',
      '405': 'Method is not PUT.',
      '413': 'Body larger than the largest media policy.',
      '429': 'Rate limited.',
      '503': 'Storage or the backing store is unavailable.',
    },
  },
  {
    name: 'mediaRead',
    method: 'GET',
    path: '/{assetId}/{variant}',
    auth: 'Bearer Firebase ID token',
    limit: { scope: 'mediaRead', perHour: 6000 },
    variants: NATIVE_MEDIA_VARIANTS,
    requestHeaders: { Authorization: 'Bearer <Firebase ID token>' },
    responseHeaders: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
    },
    statuses: {
      '200': 'WebP bytes of the display or thumbnail variant.',
      '401': 'Missing, invalid or ended session.',
      '404':
        'Unknown asset or variant, not ready, or not visible to the caller (indistinguishable).',
      '405': 'Method is not GET.',
      '429': 'Rate limited.',
      '503': 'Storage or the backing store is unavailable.',
    },
  },
  {
    name: 'accountExportDownload',
    method: 'GET',
    path: '/{exportId}',
    auth: 'Bearer Firebase ID token',
    limit: { scope: 'accountExportDownload', perHour: 20 },
    requestHeaders: { Authorization: 'Bearer <Firebase ID token>' },
    responseHeaders: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="paldora-data.json"',
      'X-Content-Type-Options': 'nosniff',
    },
    statuses: {
      '200': 'The paldora-json-v1 archive of the caller (streamed).',
      '401': 'Missing, invalid or ended session.',
      '404':
        'Unknown, foreign, not-latest, pending, expired or unavailable export (indistinguishable).',
      '405': 'Method is not GET.',
      '429': 'Rate limited.',
      '503': 'Storage or the backing store is unavailable.',
    },
  },
];
