export interface ContentSecurityPolicyOptions {
  nonce: string;
  development: boolean;
  webUrl: string;
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * The single CSP for the website. It is set only in `proxy.ts`; never add a
 * second policy in `next.config.ts`, because browsers enforce every policy
 * they receive and the intent becomes ambiguous.
 *
 * Production allows no inline script or style except Next's nonce-tagged
 * output, so components must not use `style` attributes.
 */
export function buildContentSecurityPolicy(
  options: ContentSecurityPolicyOptions,
): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${options.nonce}'`,
      "'strict-dynamic'",
      // React needs eval only for development error overlays.
      ...(options.development ? ["'unsafe-eval'"] : []),
    ],
    // Development injects styles for hot reload; a nonce would disable
    // 'unsafe-inline', so it is only used in production builds.
    'style-src': options.development
      ? ["'self'", "'unsafe-inline'"]
      : ["'self'", `'nonce-${options.nonce}'`],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  const policy = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(' ')}`,
  );
  if (options.webUrl.startsWith('https://')) {
    policy.push('upgrade-insecure-requests');
  }
  return policy.join('; ');
}
