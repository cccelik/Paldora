import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  isDeployedEnvironment,
  parseWebPublicEnvironment,
  webPublicEnvironmentKeys,
} from '@paldora/config';
import type { NextConfig } from 'next';

// Local development shares the repository-root .env. Values already present
// in the environment (CI, hosting platforms) take precedence.
const rootEnvironmentPath = fileURLToPath(
  new URL('../../.env', import.meta.url),
);
if (existsSync(rootEnvironmentPath)) loadEnvFile(rootEnvironmentPath);

// Fail the build, not the first request, when public configuration is wrong.
const environment = parseWebPublicEnvironment(process.env);

const securityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  ...(isDeployedEnvironment(environment.PALDORA_ENV)
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Inline only the validated public keys; server secrets never get here.
  env: Object.fromEntries(
    webPublicEnvironmentKeys.map((key) => [key, environment[key] ?? '']),
  ),
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: ['127.0.0.1'],
  // The Content-Security-Policy is set per request in proxy.ts, nowhere else.
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
