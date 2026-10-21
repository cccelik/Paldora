/**
 * Response headers set on every page by `next.config.ts`. The
 * Content-Security-Policy is not here: it is set per request in `proxy.ts`.
 */

/**
 * Powerful features are off except the camera, which this origin's own
 * pages need for camera reactions (`getUserMedia`). `camera=()` would make
 * every capture fail with `NotAllowedError`, indistinguishable from a person
 * denying access. Embedded frames get nothing.
 */
export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(), geolocation=(), browsing-topics=()';

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export function securityHeaders(options: {
  readonly deployed: boolean;
}): SecurityHeader[] {
  return [
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    ...(options.deployed
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ]
      : []),
  ];
}
